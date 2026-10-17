import Foundation

/// The module's composition root (K2). `RaveGuardModule.swift` forwards every JavaScript call
/// here and sends whatever reaches `emit` as an event; this file has no Expo dependency, so
/// `swift test` covers it.
///
/// The session is Justin's real `SessionManager`. Its dependencies are fakes for now (see
/// `withFakes`); J12 swaps in `ServerClient`, `HeadMotionStream`, `SessionLog`,
/// `VoicePrompter` and the noise controllers there, and nothing else changes.
///
/// `onAirPods` comes from here rather than from `SessionManager` itself: the motion source's
/// AirPods connection.
@MainActor
final class RaveGuardRuntime {
    enum Event: String, CaseIterable, Sendable { case onPhase, onMotion, onEscalation, onNoise, onHearing, onAirPods }
    typealias Emit = @MainActor (Event, [String: Any?]) -> Void

    static let protectionLevels = 0...100
    static let scenarios = 1...7

    let session: SessionManager
    private(set) var settings: ModuleSettings?
    private(set) var noiseState = NoiseState()
    private(set) var protection: AutoProtection
    var hearingState: HearingState { protection.hearing }
    /// Nil until the motion source has reported (it does once a session starts).
    private(set) var airPodsConnected: Bool?

    private let motionFeed: CannedMotionFeed
    private let noise: NoiseController
    private let emit: Emit
    private var lastEscalation: EscalationStatus?
    /// Room loudness: the canned trace in demo mode, `micLevels` otherwise (BL1).
    private let cannedLevels: CannedLevelFeed
    private let micLevels: LevelSource?
    private var activeLevels: LevelSource?
    private var airPodsTask: Task<Void, Never>?

    /// - Parameter levels: the phone mic meter; nil until the audio session lands (M5), and
    ///   then real sessions report no room level.
    init(clock: SessionClock,
         escalation: EscalationService,
         motion: MotionEventSource,
         log: SessionLogging,
         noise: NoiseController = FakeNoiseController(),
         levels: LevelSource? = nil,
         hearing: HearingConfig = HearingConfig(),
         emit: @escaping Emit) {
        session = SessionManager(clock: clock, escalation: escalation, log: log, motion: motion)
        motionFeed = CannedMotionFeed(clock: clock)
        protection = AutoProtection(config: hearing)
        cannedLevels = CannedLevelFeed(clock: clock, interval: hearing.readingInterval)
        micLevels = levels
        self.noise = noise
        self.emit = emit
        session.onPhase = { [weak self] phase in self?.phaseChanged(phase) }
        session.onEscalation = { [weak self] status in self?.escalationChanged(status) }
        motionFeed.onReadout = { [weak self] readout in
            self?.emit(.onMotion, readout.modulePayload.mapValues { $0 as Any? })
        }
        let sources: [LevelSource?] = [cannedLevels, levels]
        for source in sources.compactMap({ $0 }) {
            source.onReading = { [weak self] roomDb in self?.levelReading(roomDb) }
        }
        // MotionBroadcast gives every reader its own stream, so this doesn't take the one
        // SessionManager reads.
        let connected = motion.airPodsConnected
        airPodsTask = Task { [weak self] in
            for await isConnected in connected { self?.airPodsChanged(isConnected) }
        }
    }

    /// The app's runtime until J12: every dependency is a fake, so no network, SMS or AirPods.
    /// The phone mic is real already (BL1): it measures once Moses's audio session can record.
    static func withFakes(emit: @escaping Emit) -> RaveGuardRuntime {
        let hearing = HearingConfig()
        return RaveGuardRuntime(clock: SystemSessionClock(), escalation: FakeEscalationService(),
                                motion: FakeMotionSource(), log: InMemorySessionLog(),
                                levels: micLevelSource(config: hearing), hearing: hearing, emit: emit)
    }

    private static func micLevelSource(config: HearingConfig) -> LevelSource? {
        #if os(iOS)
        return MicLevelSource(config: config)
        #else
        return nil
        #endif
    }

    // MARK: Module API

    func configure(_ raw: [String: Any]) throws {
        let decoded = try ModuleSettings(raw)
        settings = decoded
        session.configure(decoded.session)
    }

    func startSession() { session.start() }

    /// False, and nothing happens, while a check-in or escalation is open.
    func stopSession() -> Bool { session.stop() }

    func tapCancel() { session.tapCancel() }

    func pinResult(_ kind: String) throws {
        guard let result = PINResult(rawValue: kind) else {
            throw ModuleError.invalid(field: "pinResult.kind", reason: "must be safe, duress or wrong (got \(kind))")
        }
        session.pinResult(result)
    }

    func setProtectionLevel(_ level: Int) throws {
        guard Self.protectionLevels.contains(level) else {
            throw ModuleError.invalid(field: "setProtectionLevel.level", reason: "must be 0–100 (got \(level))")
        }
        noise.apply(level: level)
        noiseState.level = level
        emit(.onNoise, noiseState.modulePayload)
        changeProtectionMode(.manual)  // The slider is the manual override (HRG-5).
    }

    func setNoiseBackend(_ kind: String) throws {
        guard let backend = NoiseBackendKind(rawValue: kind) else {
            throw ModuleError.invalid(field: "setNoiseBackend.kind", reason: "must be bridge, shortcuts or off (got \(kind))")
        }
        noiseState.backend = backend
        noiseState.connected = backend != .off  // The fake pretends every backend connects.
        emit(.onNoise, noiseState.modulePayload)
    }

    func debugFire(_ scenario: Int) throws {
        guard Self.scenarios.contains(scenario) else {
            throw ModuleError.invalid(field: "debugFire.scenario", reason: "must be 1–7 (got \(scenario))")
        }
        session.debugFire(scenario)
    }

    func debugSetOffline(_ on: Bool) { session.setSimulatedOffline(on) }

    /// `nextCheckInAt` (K8) is epoch ms while monitoring with a scheduled check-in, and nil
    /// otherwise (always nil in demo mode). It is read here rather than sent with `onPhase`
    /// because `SessionManager` schedules the check-in just after it announces `monitoring`.
    /// `simulatedOffline` (K11) is the Debug panel's switch: on after `debugSetOffline(true)`
    /// or once scenario 4 registers its escalation, off again after `stopSession()`.
    /// `airPodsConnected` is nil until the motion source has reported.
    func snapshot() -> [String: Any?] {
        ["phase": session.phase.modulePayload,
         "escalation": visibleEscalation?.modulePayload,
         "noise": noiseState.modulePayload,
         "hearing": hearingState.modulePayload,
         "nextCheckInAt": session.nextCheckIn.map { $0.timeIntervalSince1970 * 1000 },
         "simulatedOffline": session.simulatedOffline,
         "airPodsConnected": airPodsConnected]
    }

    /// Detaches from the session when the JavaScript side goes away (for example a reload).
    func shutdown() {
        airPodsTask?.cancel()
        airPodsTask = nil
        motionFeed.stop()
        stopLevels()
        session.onPhase = nil
        session.onEscalation = nil
    }

    // MARK: Session outputs

    /// Only while the wearer is looking at an escalation. A duress escalation never gets here:
    /// `SessionManager` never sends `onEscalation` for one.
    private var visibleEscalation: EscalationStatus? {
        switch session.phase {
        case .escalated, .sos: return lastEscalation
        case .idle, .monitoring, .checkIn: return nil
        }
    }

    private func phaseChanged(_ phase: SessionPhase) {
        if phase == .idle {
            motionFeed.stop()
            if stopLevels() { emit(.onHearing, hearingState.modulePayload) }
        } else if !motionFeed.isRunning {
            motionFeed.start()
            startLevels()
            emit(.onHearing, hearingState.modulePayload)
        }
        emit(.onPhase, phase.modulePayload)
    }

    private func airPodsChanged(_ connected: Bool) {
        guard connected != airPodsConnected else { return }
        airPodsConnected = connected
        emit(.onAirPods, ["connected": connected])
    }

    private func escalationChanged(_ status: EscalationStatus) {
        lastEscalation = status
        emit(.onEscalation, status.modulePayload)
    }

    // MARK: Automatic protection (BL1)

    func setProtectionMode(_ kind: String) throws {
        guard let mode = ProtectionMode(rawValue: kind) else {
            throw ModuleError.invalid(field: "setProtectionMode.mode", reason: "must be auto or manual (got \(kind))")
        }
        changeProtectionMode(mode)
    }

    /// Emits `onHearing` only when the mode actually changes.
    private func changeProtectionMode(_ mode: ProtectionMode) {
        guard protection.setMode(mode, level: noiseState.level) else { return }
        emit(.onHearing, hearingState.modulePayload)
    }

    /// A session started: automatic again, zero dose, readings from the demo trace or the mic.
    private func startLevels() {
        protection.begin(level: noiseState.level)
        activeLevels = session.config.demo ? cannedLevels : micLevels
        activeLevels?.start()
    }

    /// Returns whether a session's readings were running.
    @discardableResult
    private func stopLevels() -> Bool {
        let wasRunning = activeLevels != nil
        activeLevels?.stop()
        activeLevels = nil
        protection.end()
        return wasRunning
    }

    /// One reading, once a second while a session runs. In auto, the loop's level goes to the
    /// noise controller like the slider's does (Shortcuts applies its own 25 s dwell).
    /// A reading that arrives after Stop (a mic's last buffer) is dropped.
    private func levelReading(_ roomDb: Double) {
        guard activeLevels != nil else { return }
        let loudnessTarget = settings?.loudnessTarget ?? ModuleSettings.defaultLoudnessTarget
        let appliedLevel = noiseState.connected ? noiseState.level : nil
        if let level = protection.reading(roomDb: roomDb, level: appliedLevel, loudnessTarget: loudnessTarget) {
            noise.apply(level: level)
            noiseState.level = level
            emit(.onNoise, noiseState.modulePayload)
        }
        emit(.onHearing, hearingState.modulePayload)
    }
}
