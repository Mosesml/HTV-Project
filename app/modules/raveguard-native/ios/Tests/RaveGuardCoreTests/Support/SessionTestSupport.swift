import Foundation
@testable import RaveGuardCore

final class MemoryLog: SessionLogging {
    private(set) var events: [SessionEvent] = []
    func append(_ e: SessionEvent) { events.append(e) }
    var kinds: [SessionEventKind] { events.map(\.kind) }
}

@MainActor
final class RecordingPrompter: SessionPrompter {
    private(set) var calls: [String] = []
    func whisper() { calls.append("whisper") }
    func loud() { calls.append("loud") }
    func stop() { calls.append("stop") }
}

struct OfflineError: Error {}

/// Test double for the escalation server: keeps the server's ladder on the test clock
/// (deadline → Contact 1 → Contact 2 → venue staff → SOS, one ack window each) so the
/// session's polling sees what the real server would report. Andy's
/// `FakeEscalationService` (AN2) is the app's offline stand-in; this one also records
/// every call for assertions.
@MainActor
final class ScriptedEscalationService: EscalationService {
    struct Escalation {
        var deadline: Date
        var facts: BriefFacts
        var firedAt: Date?
        var duress = false
        var cancelledSafe = false
        var resolved = false
        var ackedAt: Date?
        var updates: [BriefFacts] = []
    }

    let clock: ManualSessionClock
    var ackWindow: TimeInterval
    var offline = false
    var recipientNames = ["Contact 1", "Contact 2", "Venue staff"]
    private(set) var calls: [String] = []
    private(set) var escalations: [String: Escalation] = [:]
    private(set) var order: [String] = []
    private var nextId = 0

    init(clock: ManualSessionClock, ackWindow: TimeInterval) {
        self.clock = clock; self.ackWindow = ackWindow
    }

    private func check() throws { if offline { throw OfflineError() } }

    func startSession(wearerName: String, selfDescription: String,
                      recipients: [Contact], demo: Bool) async throws {
        try check(); calls.append("startSession(demo: \(demo))")
    }
    func heartbeat() async { if !offline { calls.append("heartbeat") } }
    func register(deadline: Date, facts: BriefFacts) async throws -> String {
        try check()
        nextId += 1
        let id = "esc\(nextId)"
        escalations[id] = Escalation(deadline: deadline, facts: facts)
        order.append(id)
        calls.append("register(\(id))")
        return id
    }
    func update(_ id: String, facts: BriefFacts) async throws {
        try check(); escalations[id]?.updates.append(facts); calls.append("update(\(id))")
    }
    func cancel(_ id: String, mode: CancelMode) async throws {
        try check()
        calls.append("cancel(\(id), \(mode.rawValue))")
        guard var e = escalations[id] else { return }
        switch mode {
        case .safe:
            if fired(e) { e.resolved = true } else { e.cancelledSafe = true }
        case .duress:
            e.duress = true
            if e.firedAt == nil { e.firedAt = clock.now }
        }
        escalations[id] = e
    }
    func fireNow(_ id: String) async throws {
        try check()
        calls.append("fireNow(\(id))")
        if escalations[id]?.firedAt == nil { escalations[id]?.firedAt = clock.now }
    }
    func status(_ id: String) async throws -> EscalationStatus {
        try check()
        guard let e = escalations[id] else { throw OfflineError() }
        return status(of: e)
    }
    func endSession() async throws { try check(); calls.append("endSession") }

    // Contact-page actions.
    func acknowledge(_ id: String) { escalations[id]?.ackedAt = clock.now }
    func resolve(_ id: String) { escalations[id]?.resolved = true }

    var lastId: String? { order.last }

    private func fireTime(_ e: Escalation) -> Date? {
        if e.cancelledSafe { return nil }
        if let f = e.firedAt { return min(f, e.deadline) }
        return clock.now >= e.deadline ? e.deadline : nil
    }
    private func fired(_ e: Escalation) -> Bool { fireTime(e) != nil }

    private func status(of e: Escalation) -> EscalationStatus {
        if e.cancelledSafe { return .init(state: "cancelled", recipients: [], sosOpen: false) }
        guard let fired = fireTime(e) else { return .init(state: "pending", recipients: [], sosOpen: false) }
        var recipients: [RecipientStatus] = []
        for (i, name) in recipientNames.enumerated() {
            let at = fired.addingTimeInterval(Double(i) * ackWindow)
            if let ack = e.ackedAt, ack <= at { break }
            guard clock.now >= at else { break }
            let acked = (e.ackedAt.map { $0 < at.addingTimeInterval(ackWindow) } ?? false) ? e.ackedAt : nil
            recipients.append(RecipientStatus(name: name, kind: i == 2 ? .venueStaff : .contact,
                                              notifiedAt: at, ackedAt: acked))
        }
        let sos = e.ackedAt == nil && clock.now >= fired.addingTimeInterval(3 * ackWindow)
        let state = e.resolved ? "resolved" : (e.ackedAt != nil ? "acknowledged" : "notifying")
        return .init(state: state, recipients: recipients, sosOpen: sos && !e.resolved)
    }
}

/// Everything a session test needs, wired together.
@MainActor
final class SessionHarness {
    let clock = ManualSessionClock()
    let log = MemoryLog()
    let prompter = RecordingPrompter()
    let motion = FakeMotionSource()
    let server: ScriptedEscalationService
    let session: SessionManager
    private(set) var phases: [SessionPhase] = []
    private(set) var statuses: [EscalationStatus] = []

    init(demo: Bool = false, intervalMin: Int = 30, attachMotion: Bool = false) {
        let config = SessionManagerConfig(wearerName: "Alex", selfDescription: "black hoodie",
                                          recipients: [], intervalMin: intervalMin, demo: demo,
                                          teammatePhone: "+15555550123")
        server = ScriptedEscalationService(clock: clock, ackWindow: config.timings.ackWindow)
        session = SessionManager(config: config, clock: clock, escalation: server, log: log,
                                 prompter: prompter, motion: attachMotion ? motion : nil)
        session.onPhase = { [unowned self] in self.phases.append($0) }
        session.onEscalation = { [unowned self] in self.statuses.append($0) }
    }

    var timings: SessionTimings { session.config.timings }

    func advance(_ seconds: TimeInterval) async {
        // Step in 1 s increments so async server replies land before the next timer.
        var left = seconds
        while left > 0 {
            let step = min(1, left)
            clock.advance(by: step)
            left -= step
            await session.settle()
        }
    }

    func settle() async { await session.settle() }

    /// start() then a fall trigger, settled, so the escalation is registered.
    func startCheckIn() async {
        session.start()
        await settle()
        session.handleTrigger(MotionEvent(kind: .fall, at: clock.now, reason: "test fall", posture: nil))
        await settle()
    }

    var stage: CheckInStage? {
        if case let .checkIn(stage, _) = session.phase { return stage }
        return nil
    }
}
