import Foundation

/// The module's composition root (K2). `RaveGuardModule.swift` forwards every JavaScript call
/// here and sends whatever reaches `emit` as an event; this file has no Expo dependency, so
/// `swift test` covers it.
///
/// The session is Justin's real `SessionManager`. Its dependencies are fakes for now (see
/// `withFakes`); J12 swaps in `ServerClient`, `HeadMotionStream`, `SessionLog`,
/// `VoicePrompter` and the noise controllers there, and nothing else changes.
@MainActor
final class RaveGuardRuntime {
    enum Event: String, CaseIterable, Sendable { case onPhase, onMotion, onEscalation, onNoise, onHearing }
    typealias Emit = @MainActor (Event, [String: Any?]) -> Void

    static let protectionLevels = 0...100
    static let scenarios = 1...7

    let session: SessionManager
    private(set) var settings: ModuleSettings?
    private(set) var noiseState = NoiseState()
    private(set) var hearingState = HearingState()

    private let motionFeed: CannedMotionFeed
    private let noise: NoiseController
    private let emit: Emit
    private var lastEscalation: EscalationStatus?

    init(clock: SessionClock,
         escalation: EscalationService,
         motion: MotionEventSource,
         log: SessionLogging,
         noise: NoiseController = FakeNoiseController(),
         emit: @escaping Emit) {
        session = SessionManager(clock: clock, escalation: escalation, log: log, motion: motion)
        motionFeed = CannedMotionFeed(clock: clock)
        self.noise = noise
        self.emit = emit
        session.onPhase = { [weak self] phase in self?.phaseChanged(phase) }
        session.onEscalation = { [weak self] status in self?.escalationChanged(status) }
        motionFeed.onReadout = { [weak self] readout in
            self?.emit(.onMotion, readout.modulePayload.mapValues { $0 as Any? })
        }
    }

    /// The app's runtime until J12: every dependency is a fake, so no network, SMS or AirPods.
    static func withFakes(emit: @escaping Emit) -> RaveGuardRuntime {
        RaveGuardRuntime(clock: SystemSessionClock(), escalation: FakeEscalationService(),
                         motion: FakeMotionSource(), log: InMemorySessionLog(), emit: emit)
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
    func snapshot() -> [String: Any?] {
        ["phase": session.phase.modulePayload,
         "escalation": visibleEscalation?.modulePayload,
         "noise": noiseState.modulePayload,
         "hearing": hearingState.modulePayload,
         "nextCheckInAt": session.nextCheckIn.map { $0.timeIntervalSince1970 * 1000 },
         "simulatedOffline": session.simulatedOffline]
    }

    /// Detaches from the session when the JavaScript side goes away (for example a reload).
    func shutdown() {
        motionFeed.stop()
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
        } else if !motionFeed.isRunning {
            motionFeed.start()
            emit(.onHearing, hearingState.modulePayload)
        }
        emit(.onPhase, phase.modulePayload)
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
        guard hearingState.mode != mode else { return }
        hearingState.mode = mode
        emit(.onHearing, hearingState.modulePayload)
    }
}
