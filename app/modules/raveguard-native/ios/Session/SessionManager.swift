import Foundation

/// Voice prompts and haptics for the check-in ladder. Moses's `VoicePrompter` conforms;
/// `loud()` includes the haptic.
@MainActor
protocol SessionPrompter: AnyObject {
    func whisper()   // "Nod if you're okay"
    func loud()      // "Are you okay? Nod, or tap Cancel" + haptic
    func stop()
}

/// Everything the brief needs that the session knows. By default `BriefFactsBuilder` turns
/// it into `BriefFacts`; the location fix (AN10) plugs in through `SessionManager.buildFacts`.
struct SessionFactsContext: Sendable {
    let config: SessionManagerConfig
    let trigger: MotionEvent
    let promptsUnanswered: Int
    /// The session log so far (A11), which the brief's last-active facts come from.
    let events: [SessionEvent]
}

/// The check-in session state machine (SES-1–4, ESC-1, ESC-2, ESC-7).
///
/// idle → monitoring → checkIn(whisper → loud → pinGate) → escalated → sos, and back to
/// monitoring on a nod, tap, safe PIN, or a recipient resolving. A duress PIN looks
/// exactly like a safe cancel from the outside: the phase goes back to `.monitoring`, no
/// `onEscalation` is ever sent for it, and the escalation is tracked silently until the
/// server closes it.
///
/// Pure logic: time comes from the injected clock, and every side effect goes through an
/// injected protocol, so the whole ladder runs in unit tests.
@MainActor
final class SessionManager {
    // MARK: Outputs

    private(set) var phase: SessionPhase = .idle {
        didSet {
            guard phase != oldValue else { return }
            // BL3: the stillness countdown runs only while monitoring, from the start each time.
            if phase == .monitoring { stillness.resume() } else { stillness.pause() }
            onPhase?(phase)
        }
    }
    private(set) var config: SessionManagerConfig
    private(set) var nextCheckIn: Date?
    /// Simulated network outage for the Debug panel; every server call fails while set.
    private(set) var simulatedOffline = false

    var onPhase: ((SessionPhase) -> Void)?
    /// Status of the escalation the wearer may see. Never called for a duress escalation.
    var onEscalation: ((EscalationStatus) -> Void)?
    var buildFacts: (SessionFactsContext) -> BriefFacts = SessionManager.defaultFacts

    // MARK: Dependencies

    private let clock: SessionClock
    private let escalation: EscalationService
    private let log: SessionLogging
    private let prompter: SessionPrompter?
    private let motion: MotionEventSource?

    // MARK: State

    private var checkIn: CheckIn?
    /// The escalation the wearer is looking at (escalated or SOS).
    private var visible: EscalationHandle?
    /// Duress escalations, tracked with no trace in the UI.
    private var silent: [EscalationHandle] = []
    private var endServerSessionWhenSilentDone = false
    private var serverSessionReady = false
    private var serverSessionStarting = false
    private var awaitingServerSession: [() -> Void] = []
    private var offlineAfterNextRegister = false

    private var stageTimer: SessionTimer?
    private var scheduledTimer: SessionTimer?
    private var heartbeatTimer: SessionTimer?
    private var pollTimer: SessionTimer?
    private var motionTasks: [Task<Void, Never>] = []
    private var inflight: [UUID: Task<Void, Never>] = [:]

    /// Last motion state written to the log, so only changes are logged.
    private var loggedMotionState: MotionState?

    /// BL3: still too long while monitoring starts a check-in.
    private lazy var stillness: StillnessWatch = {
        let watch = StillnessWatch(clock: clock) { [weak self] in
            self?.config.timings.stillnessTrigger ?? SessionTimings.real.stillnessTrigger
        }
        watch.onStill = { [weak self] seconds in
            guard let self else { return }
            self.handleTrigger(MotionEvent(kind: .stillness, at: self.clock.now,
                                           reason: StillnessWatch.reason(seconds), posture: nil))
        }
        return watch
    }()

    /// For tests: whether a stillness countdown is running.
    var stillnessCountdownRunning: Bool { stillness.isCountingDown }

    init(config: SessionManagerConfig = .init(),
         clock: SessionClock,
         escalation: EscalationService,
         log: SessionLogging,
         prompter: SessionPrompter? = nil,
         motion: MotionEventSource? = nil) {
        self.config = config
        self.clock = clock
        self.escalation = escalation
        self.log = log
        self.prompter = prompter
        self.motion = motion
    }

    // MARK: Module API

    /// New settings apply from the next check-in; a running check-in keeps its timings.
    func configure(_ config: SessionManagerConfig) {
        self.config = config
        if phase == .monitoring { scheduleNextCheckIn() }
    }

    func start() {
        guard phase == .idle else { return }
        endServerSessionWhenSilentDone = false
        phase = .monitoring
        loggedMotionState = nil
        record(.sessionStarted, config.demo ? "demo" : nil)
        startServerSession()
        do {
            try motion?.start()
        } catch {
            record(.sessionStarted, "motion unavailable: \(error)")
        }
        attachMotionStreams()
        startHeartbeat()
        scheduleNextCheckIn()
    }

    /// Ends the session. Only allowed while monitoring: a check-in or an open escalation
    /// has to be answered or resolved first, so stopping can't swallow an alert.
    @discardableResult
    func stop() -> Bool {
        guard phase == .monitoring else { return phase == .idle }
        scheduledTimer?.cancel(); scheduledTimer = nil
        nextCheckIn = nil
        motionTasks.forEach { $0.cancel() }; motionTasks = []
        motion?.setListeningForNod(false)
        motion?.stop()
        prompter?.stop()
        simulatedOffline = false
        phase = .idle
        stillness.reset()
        record(.sessionEnded, nil)
        if silent.isEmpty {
            endServerSession()
        } else {
            // A duress alert is still live. Deleting the server session would kill it,
            // so keep heartbeats and polling going and end it once the server closes it.
            endServerSessionWhenSilentDone = true
        }
        return true
    }

    func tapCancel() {
        guard let stage = checkIn?.stage, stage != .pinGate else { return }
        record(.tapCancel, nil)
        cancelCheckIn()
    }

    func pinResult(_ result: PINResult) {
        let target = checkIn?.handle ?? visible
        guard let target else { return }
        switch result {
        case .safe:
            record(.pinSafe, nil)
            if checkIn != nil {
                cancelCheckIn()
            } else {
                send(.safe, for: target)
                visible = nil
                returnToMonitoring()
            }
        case .duress:
            record(.pinDuress, nil)
            send(.duress, for: target)
            silent.append(target)
            if checkIn != nil { endCheckInLocally() }
            visible = nil
            returnToMonitoring()
            updatePolling()
        case .wrong:
            target.wrongPins += 1
            record(.pinWrong, "\(target.wrongPins) of 3")
            if target.wrongPins >= 3, checkIn != nil {
                fire(target)
                escalate(reason: "3 wrong PINs")
            }
        }
    }

    /// Debug panel scenarios 1–7. Each starts a check-in the way the scenario does;
    /// the person running the demo does the rest (nod, wait, PIN, airplane mode...).
    func debugFire(_ scenario: Int) {
        guard (1...7).contains(scenario) else { return }
        if phase == .idle { start() }
        let event: MotionEvent
        switch scenario {
        case 2, 5, 7:
            event = MotionEvent(kind: .fall, at: clock.now,
                                reason: "spike 3.1 g, head 70° sideways, still 12 s (debug)",
                                posture: Posture(pitchDeg: 5, rollDeg: 70))
        default:
            event = MotionEvent(kind: .manual, at: clock.now,
                                reason: "debug scenario \(scenario)", posture: nil)
        }
        // Scenario 4 goes offline mid-countdown: once the escalation is registered, so the
        // server holds the deadline and fires on its own.
        offlineAfterNextRegister = scenario == 4
        handleTrigger(event)
    }

    func setSimulatedOffline(_ on: Bool) { simulatedOffline = on }

    // MARK: Motion intake

    func handleTrigger(_ event: MotionEvent) {
        guard phase != .idle else { return }
        record(.trigger, "\(event.kind.rawValue): \(event.reason)")
        guard phase == .monitoring else { return }
        beginCheckIn(event)
    }

    func handleNod(at date: Date) {
        guard let stage = checkIn?.stage, stage != .pinGate else { return }
        record(.nod, nil)
        cancelCheckIn()
    }

    func handleAirPodsConnected(_ connected: Bool) {
        if !connected { stillness.stateChanged(.unknown) }   // no data isn't stillness (BL3)
        guard phase != .idle, !connected else { return }
        record(.airPodsDisconnected, nil)
    }

    func handleMotionState(_ state: MotionState) {
        stillness.stateChanged(state)
        // Logged on change only; BriefFactsBuilder reads "dancing until 01:42" from these.
        guard phase != .idle, state != loggedMotionState else { return }
        loggedMotionState = state
        record(.motionState, state.rawValue)
    }

    // MARK: Ladder

    private func scheduleNextCheckIn() {
        scheduledTimer?.cancel(); scheduledTimer = nil
        nextCheckIn = nil
        guard phase == .monitoring, let interval = config.scheduledInterval else { return }
        nextCheckIn = clock.now.addingTimeInterval(interval)
        scheduledTimer = clock.schedule(after: interval) { [weak self] in
            guard let self else { return }
            self.scheduledTimer = nil
            self.handleTrigger(MotionEvent(kind: .scheduled, at: self.clock.now,
                                           reason: "scheduled check-in", posture: nil))
        }
    }

    private func beginCheckIn(_ trigger: MotionEvent) {
        scheduledTimer?.cancel(); scheduledTimer = nil
        nextCheckIn = nil
        let timings = config.timings
        let handle = EscalationHandle()
        checkIn = CheckIn(handle: handle, trigger: trigger, timings: timings, stage: .whisper)
        record(.checkInStarted, trigger.kind.rawValue)
        enter(.whisper)
        register(handle, deadline: clock.now.addingTimeInterval(timings.deadline),
                 facts: facts(for: checkIn!))
    }

    private func enter(_ stage: CheckInStage) {
        guard var current = checkIn else { return }
        current.stage = stage
        let duration: TimeInterval
        switch stage {
        case .whisper:
            duration = current.timings.whisper
            motion?.setListeningForNod(true)
            prompter?.whisper()
        case .loud:
            duration = current.timings.loud
            current.promptsUnanswered = 1
            record(.promptEscalated, nil)
            prompter?.loud()
        case .pinGate:
            duration = current.timings.pinGate
            current.promptsUnanswered = 2
            motion?.setListeningForNod(false)
            prompter?.stop()
            record(.pinGateOpened, nil)
        }
        checkIn = current
        if stage != .whisper { update(current.handle, facts: facts(for: current)) }
        stageTimer?.cancel()
        stageTimer = clock.schedule(after: duration) { [weak self] in self?.stageExpired() }
        phase = .checkIn(stage, stageEndsAt: clock.now.addingTimeInterval(duration))
    }

    private func stageExpired() {
        stageTimer = nil
        switch checkIn?.stage {
        case .whisper: enter(.loud)
        case .loud: enter(.pinGate)
        case .pinGate: escalate(reason: "no answer")
        case nil: break
        }
    }

    /// The deadline passed (or 3 wrong PINs). The server owns the clock from here; the
    /// phone only shows the chain and polls it.
    private func escalate(reason: String) {
        guard let current = checkIn else { return }
        endCheckInLocally()
        visible = current.handle
        record(.escalated, reason)
        phase = .escalated(escalationId: current.handle.serverId ?? "")
        updatePolling()
    }

    /// Nod, tap or safe PIN during a check-in.
    private func cancelCheckIn() {
        guard let current = checkIn else { return }
        endCheckInLocally()
        send(.safe, for: current.handle)
        returnToMonitoring()
    }

    private func endCheckInLocally() {
        stageTimer?.cancel(); stageTimer = nil
        motion?.setListeningForNod(false)
        prompter?.stop()
        checkIn = nil
    }

    private func returnToMonitoring() {
        phase = .monitoring
        scheduleNextCheckIn()
    }

    private func facts(for current: CheckIn) -> BriefFacts {
        buildFacts(SessionFactsContext(config: config, trigger: current.trigger,
                                       promptsUnanswered: current.promptsUnanswered,
                                       events: log.events))
    }

    nonisolated static func defaultFacts(_ c: SessionFactsContext) -> BriefFacts {
        BriefFactsBuilder.build(events: c.events, wearerName: c.config.wearerName,
                                selfDescription: c.config.selfDescription, trigger: c.trigger)
    }

    // MARK: Server calls

    private struct SimulatedOfflineError: Error {}

    private func online() throws {
        if simulatedOffline { throw SimulatedOfflineError() }
    }

    private func startServerSession() {
        guard !serverSessionReady, !serverSessionStarting else { return }
        serverSessionStarting = true
        let cfg = config
        spawn { [weak self] in
            guard let self else { return }
            do {
                try self.online()
                try await self.escalation.startSession(wearerName: cfg.wearerName,
                                                       selfDescription: cfg.selfDescription,
                                                       recipients: cfg.recipients, demo: cfg.demo)
                self.serverSessionStarting = false
                self.serverSessionReady = true
                if self.phase == .idle && self.silent.isEmpty {
                    self.endServerSession()   // stopped while this call was in flight
                    return
                }
                let waiting = self.awaitingServerSession
                self.awaitingServerSession = []
                waiting.forEach { $0() }
            } catch {
                self.serverSessionStarting = false
                self.retryLater { [weak self] in
                    guard let self, self.phase != .idle || !self.silent.isEmpty else { return }
                    self.startServerSession()
                }
            }
        }
    }

    private func whenServerSessionReady(_ work: @escaping () -> Void) {
        if serverSessionReady { work() } else { awaitingServerSession.append(work) }
    }

    private func register(_ handle: EscalationHandle, deadline: Date, facts: BriefFacts) {
        whenServerSessionReady { [weak self] in
            guard let self else { return }
            // Safe-cancelled before it ever reached the server: nothing to register.
            if handle.pendingCancel == .safe, !handle.pendingFire { return }
            self.spawn { [weak self] in
                guard let self else { return }
                do {
                    try self.online()
                    let id = try await self.escalation.register(deadline: deadline, facts: facts)
                    handle.serverId = id
                    if self.offlineAfterNextRegister {
                        self.offlineAfterNextRegister = false
                        self.simulatedOffline = true
                    }
                    if self.visible === handle, case .escalated = self.phase {
                        self.phase = .escalated(escalationId: id)
                    }
                    if let mode = handle.pendingCancel { self.performCancel(handle, mode: mode) }
                    else if handle.pendingFire { self.performFire(handle) }
                    self.updatePolling()
                } catch {
                    self.retryLater { [weak self] in
                        self?.register(handle, deadline: deadline, facts: facts)
                    }
                }
            }
        }
    }

    private func update(_ handle: EscalationHandle, facts: BriefFacts) {
        guard let id = handle.serverId else { return }
        spawn { [weak self] in
            guard let self, !self.simulatedOffline else { return }
            try? await self.escalation.update(id, facts: facts)
        }
    }

    private func send(_ mode: CancelMode, for handle: EscalationHandle) {
        // A duress cancel outranks an earlier safe one, never the other way round.
        if handle.pendingCancel != .duress { handle.pendingCancel = mode }
        // Not registered yet: `register` sends the cancel as soon as it lands.
        if handle.serverId != nil { performCancel(handle, mode: handle.pendingCancel!) }
    }

    /// Retried until it lands (ESC-2). A late safe cancel makes the server text an all-clear.
    private func performCancel(_ handle: EscalationHandle, mode: CancelMode) {
        guard let id = handle.serverId else { return }
        spawn { [weak self] in
            guard let self else { return }
            do {
                try self.online()
                try await self.escalation.cancel(id, mode: mode)
                handle.cancelSent = mode
                if mode == .safe { handle.closed = true; self.updatePolling() }
            } catch {
                self.retryLater { [weak self] in self?.performCancel(handle, mode: mode) }
            }
        }
    }

    private func fire(_ handle: EscalationHandle) {
        handle.pendingFire = true
        if handle.serverId != nil { performFire(handle) }
    }

    private func performFire(_ handle: EscalationHandle) {
        guard let id = handle.serverId else { return }
        spawn { [weak self] in
            guard let self else { return }
            do {
                try self.online()
                try await self.escalation.fireNow(id)
            } catch {
                self.retryLater { [weak self] in self?.performFire(handle) }
            }
        }
    }

    private func endServerSession() {
        guard serverSessionReady else { return }
        serverSessionReady = false
        heartbeatTimer?.cancel(); heartbeatTimer = nil
        pollTimer?.cancel(); pollTimer = nil
        spawn { [weak self] in
            try? await self?.escalation.endSession()
        }
    }

    // MARK: Heartbeat and polling

    private func startHeartbeat() {
        guard heartbeatTimer == nil else { return }
        heartbeatTimer = clock.schedule(after: config.timings.heartbeat) { [weak self] in
            guard let self else { return }
            self.heartbeatTimer = nil
            guard self.phase != .idle || !self.silent.isEmpty else { return }
            if self.serverSessionReady && !self.simulatedOffline {
                self.spawn { [weak self] in await self?.escalation.heartbeat() }
            }
            self.startHeartbeat()
        }
    }

    private var watched: [EscalationHandle] {
        (silent + [visible].compactMap { $0 }).filter { !$0.closed && $0.serverId != nil }
    }

    private func updatePolling() {
        if watched.isEmpty {
            pollTimer?.cancel(); pollTimer = nil
        } else if pollTimer == nil {
            pollTimer = clock.schedule(after: config.timings.statusPoll) { [weak self] in
                guard let self else { return }
                self.pollTimer = nil
                self.poll()
                self.updatePolling()
            }
        }
    }

    private func poll() {
        guard !simulatedOffline else { return }
        for handle in watched {
            guard let id = handle.serverId else { continue }
            spawn { [weak self] in
                guard let self, let status = try? await self.escalation.status(id) else { return }
                self.handle(status, for: handle)
            }
        }
    }

    private static let closedStates: Set<String> = ["resolved", "cancelled"]

    private func handle(_ status: EscalationStatus, for handle: EscalationHandle) {
        let previous = handle.lastStatus
        handle.lastStatus = status
        let closed = Self.closedStates.contains(status.state)

        if silent.contains(where: { $0 === handle }) {
            if closed {
                handle.closed = true
                silent.removeAll { $0 === handle }
                if endServerSessionWhenSilentDone && silent.isEmpty && phase == .idle {
                    endServerSessionWhenSilentDone = false
                    endServerSession()
                }
            }
            updatePolling()
            return
        }
        guard visible === handle else { return }

        for r in status.recipients {
            let before = previous?.recipients.first { $0.name == r.name && $0.kind == r.kind }
            if r.notifiedAt != nil && before?.notifiedAt == nil { record(.recipientNotified, r.name) }
            if r.ackedAt != nil && before?.ackedAt == nil { record(.recipientAcked, r.name) }
        }
        onEscalation?(status)

        if closed {
            handle.closed = true
            visible = nil
            record(.resolved, status.state)
            returnToMonitoring()
        } else if status.sosOpen && phase != .sos {
            phase = .sos
        }
        updatePolling()
    }

    // MARK: Plumbing

    private func attachMotionStreams() {
        guard let motion, motionTasks.isEmpty else { return }
        let triggers = motion.triggers, nods = motion.nods
        let connected = motion.airPodsConnected, states = motion.states
        motionTasks = [
            Task { [weak self] in for await e in triggers { self?.handleTrigger(e) } },
            Task { [weak self] in for await d in nods { self?.handleNod(at: d) } },
            Task { [weak self] in for await c in connected { self?.handleAirPodsConnected(c) } },
            Task { [weak self] in for await s in states { self?.handleMotionState(s) } },
        ]
    }

    private func retryLater(_ work: @escaping @MainActor () -> Void) {
        clock.schedule(after: config.timings.retry, work)
    }

    private func spawn(_ work: @escaping @MainActor () async -> Void) {
        let id = UUID()
        inflight[id] = Task { [weak self] in
            await work()
            self?.inflight[id] = nil
        }
    }

    /// Waits until every server call started so far (and any they started) has finished.
    /// Tests use it after advancing the clock.
    func settle() async {
        while let (id, task) = inflight.first {
            await task.value
            inflight[id] = nil
        }
    }

    private func record(_ kind: SessionEventKind, _ detail: String?) {
        log.append(SessionEvent(id: UUID(), at: clock.now, kind: kind, detail: detail))
    }
}

/// One check-in's escalation, from registration to close.
@MainActor
private final class EscalationHandle {
    var serverId: String?
    var pendingCancel: CancelMode?
    var cancelSent: CancelMode?
    var pendingFire = false
    var wrongPins = 0
    var closed = false
    var lastStatus: EscalationStatus?
}

private struct CheckIn {
    let handle: EscalationHandle
    let trigger: MotionEvent
    let timings: SessionTimings
    var stage: CheckInStage
    var promptsUnanswered = 0
}

extension SessionPhase {
    /// `onPhase` payload for the Expo module: phase, stage, stageEndsAt, escalationId.
    var modulePayload: [String: Any?] {
        switch self {
        case .idle: return ["phase": "idle", "stage": nil, "stageEndsAt": nil, "escalationId": nil]
        case .monitoring: return ["phase": "monitoring", "stage": nil, "stageEndsAt": nil, "escalationId": nil]
        case let .checkIn(stage, endsAt):
            return ["phase": "checkIn", "stage": stage.rawValue,
                    "stageEndsAt": endsAt.timeIntervalSince1970 * 1000, "escalationId": nil]
        case let .escalated(id):
            return ["phase": "escalated", "stage": nil, "stageEndsAt": nil, "escalationId": id]
        case .sos: return ["phase": "sos", "stage": nil, "stageEndsAt": nil, "escalationId": nil]
        }
    }
}
