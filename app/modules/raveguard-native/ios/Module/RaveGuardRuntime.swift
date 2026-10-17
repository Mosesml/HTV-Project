import Foundation

/// The module's composition root (K2). `RaveGuardModule.swift` forwards every JavaScript call
/// here and sends whatever reaches `emit` as an event; this file has no Expo dependency, so
/// `swift test` covers it.
///
/// The session is Justin's real `SessionManager`. On a phone its motion is Justin's real
/// `HeadMotionStream` (J12, motion half), and Shortcuts noise control and the mic/audio
/// session are real. `ServerClient` is used when the build names a server; the session log
/// is the on-device file (A11). M6 voice prompts use the shared audio session on iOS.
///
/// Two things JavaScript sees come from here rather than from `SessionManager` itself:
/// `onPhase`'s `trigger` (what started the open check-in, learned from the session log by
/// `TriggerTrackingLog`) and `onAirPods` (the motion source's AirPods connection).
@MainActor
final class RaveGuardRuntime {
    enum Event: String, CaseIterable, Sendable { case onPhase, onMotion, onEscalation, onNoise, onHearing, onAirPods }
    typealias Emit = @MainActor (Event, [String: Any?]) -> Void

    static let protectionLevels = 0...100
    static let scenarios = 1...7

    let session: SessionManager
    private let audioSession: AudioSessionManaging
    private let prompter: VoicePrompter?
    private(set) var settings: ModuleSettings?
    private(set) var noiseState = NoiseState()
    private(set) var protection: AutoProtection
    var hearingState: HearingState { protection.hearing }
    /// Nil until the motion source has reported (it does once a session starts).
    private(set) var airPodsConnected: Bool?

    /// `onMotion` while a session runs: the AirPods' readouts, or the canned sway without them.
    private let motionFeed: MotionReadoutFeed
    private var noise: NoiseController
    private let shortcutsController: ShortcutsController?
    private let emit: Emit
    private let triggers: TriggerTrackingLog
    private var lastEscalation: EscalationStatus?
    private var airPodsTask: Task<Void, Never>?
    /// Room loudness: the canned trace in demo mode, `micLevels` otherwise (BL1).
    private let cannedLevels: CannedLevelFeed
    private let micLevels: LevelSource?
    private var activeLevels: LevelSource?

    /// - Parameter levels: the phone mic meter; nil means real sessions report no room level.
    /// - Parameter readouts: the AirPods' 10 Hz readouts (`HeadMotionStream.readouts`), sent as
    ///   `onMotion` while a session runs; nil sends the canned sway instead.
    init(clock: SessionClock,
         escalation: EscalationService,
         motion: MotionEventSource,
         log: SessionLogging,
         noise: NoiseController = FakeNoiseController(),
         shortcutsController: ShortcutsController? = nil,
         audioSession: AudioSessionManaging? = nil,
         prompter: VoicePrompter? = nil,
         levels: LevelSource? = nil,
         hearing: HearingConfig = HearingConfig(),
         readouts: (() -> AsyncStream<MotionReadout>)? = nil,
         emit: @escaping Emit) {
        triggers = TriggerTrackingLog(wrapping: log)
        session = SessionManager(clock: clock, escalation: escalation, log: triggers,
                                 prompter: prompter, motion: motion)
        self.audioSession = audioSession ?? SystemAudioSessionManager()
        self.prompter = prompter
        motionFeed = readouts.map { LiveMotionFeed(readouts: $0) } ?? CannedMotionFeed(clock: clock)
        protection = AutoProtection(config: hearing)
        cannedLevels = CannedLevelFeed(clock: clock, interval: hearing.readingInterval)
        micLevels = levels
        self.noise = noise
        self.shortcutsController = shortcutsController
        self.emit = emit
        shortcutsController?.onStateChange = { [weak self] state in self?.shortcutsChanged(state) }
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
            for await isConnected in connected {
                // A value buffered before shutdown() cancelled this task still arrives; drop it.
                guard !Task.isCancelled else { return }
                self?.airPodsChanged(isConnected)
            }
        }
    }

    /// The app's runtime until the rest of J12. On a phone these are real: the AirPods' head
    /// motion (`HeadMotionStream`: triggers, nods, state, `onMotion`, `onAirPods`) while a
    /// session runs, the phone mic (BL1) with Moses's audio session, and the selectable
    /// Shortcuts noise backend (which still needs the Shortcuts set up on the device).
    /// Escalation is Andy's `ServerClient` when the build sets `RGServerURL`, else the fake;
    /// the session log is the on-device file. Voice prompts require A2DP output; otherwise
    /// the check-in uses screen and haptics.
    /// Off iOS (`swift test` on a Mac) motion is `FakeMotionSource` and the canned sway.
    static func withFakes(emit: @escaping Emit) -> RaveGuardRuntime {
        let hearing = HearingConfig()
        let head = headMotionStream()
        #if canImport(UIKit)
        let shortcutsController = ShortcutsController()
        #else
        let shortcutsController: ShortcutsController? = nil
        #endif
        let escalation = escalationService(serverURL: Bundle.main.object(forInfoDictionaryKey: serverURLKey))
        NSLog("RaveGuard escalation: %@", escalation.backend)
        return RaveGuardRuntime(clock: SystemSessionClock(), escalation: escalation.service,
                                motion: head ?? FakeMotionSource(), log: sessionLog(),
                                shortcutsController: shortcutsController,
                                prompter: voicePrompter(),
                                levels: micLevelSource(config: hearing), hearing: hearing,
                                readouts: head.map { stream in { stream.readouts } }, emit: emit)
    }

    /// Info.plist key for the escalation server's origin, set from `RG_SERVER_URL` at build
    /// time (app.config.ts). Absent until the server is deployed (AN1).
    nonisolated static let serverURLKey = "RGServerURL"

    /// J12 server half: Andy's `ServerClient` when the build names a server, otherwise
    /// `FakeEscalationService`, so a build without one still runs the whole ladder offline.
    /// A malformed or non-HTTPS URL also falls back to the fake rather than crashing at launch.
    nonisolated static func escalationService(serverURL raw: Any?) -> (service: EscalationService, backend: String) {
        if let text = (raw as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty {
            if let url = URL(string: text), let client = try? ServerClient(baseURL: url) {
                return (client, "server \(text)")
            }
            return (FakeEscalationService(), "fake (RGServerURL \"\(text)\" is not a usable HTTPS URL)")
        }
        return (FakeEscalationService(), "fake (no RGServerURL)")
    }

    /// A11: the on-device file log on a phone; in memory elsewhere, and if Application
    /// Support can't be opened (the session still runs, it just isn't kept).
    private static func sessionLog() -> SessionLogging {
        #if os(iOS)
        if let log = try? SessionLog.standard() { return log }
        NSLog("RaveGuard session log: Application Support unavailable, keeping it in memory")
        #endif
        return InMemorySessionLog()
    }

    private static func headMotionStream() -> HeadMotionStream? {
        #if canImport(CoreMotion) && os(iOS)
        return HeadMotionStream()
        #else
        return nil
        #endif
    }

    private static func micLevelSource(config: HearingConfig) -> LevelSource? {
        #if os(iOS)
        return MicLevelSource(config: config)
        #else
        return nil
        #endif
    }

    private static func voicePrompter() -> VoicePrompter? {
        #if os(iOS)
        return VoicePrompter(output: SystemVoicePromptOutput())
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

    func startSession() {
        audioSession.activateForMonitoring()
        session.start()
    }

    /// False, and nothing happens, while a check-in or escalation is open.
    func stopSession() -> Bool {
        let stopped = session.stop()
        if stopped {
            shortcutsController?.reset()
            audioSession.deactivateAfterMonitoring()
        }
        return stopped
    }

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
        if backend == .shortcuts && noiseState.backend == .shortcuts {
            noise.apply(level: noiseState.level)
            emit(.onNoise, noiseState.modulePayload)
            return
        }
        if noiseState.backend == .shortcuts && backend != .shortcuts { shortcutsController?.reset() }
        if backend == .shortcuts {
            noise = shortcutsController ?? FakeNoiseController()
        } else {
            noise = FakeNoiseController()
        }
        noiseState.backend = backend
        // A real backend is ready only after its Shortcut reports success. Test fakes
        // retain the original deterministic connected state.
        noiseState.connected = backend != .off && (backend != .shortcuts || shortcutsController == nil)
        emit(.onNoise, noiseState.modulePayload)
        if backend == .shortcuts, shortcutsController != nil { noise.apply(level: noiseState.level) }
    }

    @discardableResult
    func handleNoiseCallbackURL(_ rawURL: String) -> Bool {
        guard noiseState.backend == .shortcuts, let shortcutsController,
              let url = URL(string: rawURL),
              shortcutsController.handleCallbackURL(url) else { return false }
        return true
    }

    private func shortcutsChanged(_ state: ShortcutsControllerState) {
        guard noiseState.backend == .shortcuts else { return }
        switch state.phase {
        case .completed: noiseState.connected = true
        case .idle, .cancelled, .failed: noiseState.connected = false
        case .scheduled, .opening, .launched: break
        }
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
        ["phase": phasePayload(session.phase),
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
        prompter?.shutdown()
        motionFeed.stop()
        stopLevels()
        shortcutsController?.reset()
        shortcutsController?.onStateChange = nil
        audioSession.deactivateAfterMonitoring()
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
        emit(.onPhase, phasePayload(phase))
    }

    /// Justin's `onPhase` payload plus `trigger`: what started the check-in, from the moment
    /// it opens through its escalation and SOS; nil while idle or monitoring, so a duress PIN
    /// (back to monitoring) looks exactly like a safe one.
    private func phasePayload(_ phase: SessionPhase) -> [String: Any?] {
        var payload = phase.modulePayload
        let trigger: Any?
        switch phase {
        case .checkIn, .escalated, .sos: trigger = triggers.current?.modulePayload
        case .idle, .monitoring: trigger = nil
        }
        // `.some` keeps the key with a null value instead of removing it.
        payload["trigger"] = .some(trigger)
        return payload
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
        if noiseState.backend == .shortcuts, shortcutsController != nil { noise.apply(level: noiseState.level) }
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
