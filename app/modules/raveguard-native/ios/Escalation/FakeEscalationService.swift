import Foundation

/// Offline simulation. No network, location, SMS, or durable storage.
/// Time is evaluated on each call; status polling catches up missed local timer windows.
actor FakeEscalationService: EscalationService {
    enum Failure: Error { case noSession, alreadyStarted, notFound, forbidden, notNotified, closed }

    private struct Record {
        var facts: BriefFacts
        var state = "pending"
        var due: Date
        var nextRecipient = 0
        var notified: [UUID: Date] = [:]
        var acknowledged: [UUID: Date] = [:]
        var sosOpen = false
    }
    private let clock: () -> Date
    private var started = false
    private var recipients: [Contact] = []
    private var ackWindow: TimeInterval = 120
    private var records: [String: Record] = [:]

    init(clock: (() -> Date)? = nil) {
        if let clock { self.clock = clock }
        else {
            let wallOrigin = Date()
            let continuous = ContinuousClock()
            let origin = continuous.now
            self.clock = {
                let elapsed = origin.duration(to: continuous.now).components
                return wallOrigin.addingTimeInterval(Double(elapsed.seconds) + Double(elapsed.attoseconds) / 1e18)
            }
        }
    }

    func startSession(wearerName: String, selfDescription: String,
                      recipients: [Contact], demo: Bool) async throws {
        guard !started else { throw Failure.alreadyStarted }
        started = true
        // Stable order for equal ranks; exclude recipients who opted out of alerts.
        self.recipients = recipients.enumerated()
            .filter { $0.element.permissions.receiveAlerts }
            .sorted { left, right in
                left.element.order == right.element.order
                    ? left.offset < right.offset : left.element.order < right.element.order
            }.map(\.element)
        ackWindow = demo ? 20 : 120
    }

    // No watchdog in AN2; heartbeats never postpone an existing deadline.
    func heartbeat() async { sweep() }

    func register(deadline: Date, facts: BriefFacts) async throws -> String {
        try requireSession()
        let id = UUID().uuidString
        records[id] = Record(facts: facts, due: deadline)
        sweep()
        return id
    }

    func update(_ escalationId: String, facts: BriefFacts) async throws {
        var record = try current(escalationId)
        guard record.state != "resolved", record.state != "cancelled" else { throw Failure.closed }
        record.facts = facts
        records[escalationId] = record
    }

    func cancel(_ escalationId: String, mode: CancelMode) async throws {
        var record = try current(escalationId)
        if record.state == "resolved" || record.state == "cancelled" { return }
        if mode == .duress {
            // Do not restart the chain when a duress request is retried.
            if record.state == "pending" {
                record.due = clock()
                records[escalationId] = record
                sweep()
            }
        } else {
            record.state = record.notified.isEmpty ? "cancelled" : "resolved"
            record.sosOpen = false
            records[escalationId] = record
        }
    }

    func fireNow(_ escalationId: String) async throws {
        var record = try current(escalationId)
        guard record.state == "pending" else { return }
        record.due = clock()
        records[escalationId] = record
        sweep()
    }

    func status(_ escalationId: String) async throws -> EscalationStatus {
        let record = try current(escalationId)
        return EscalationStatus(state: record.state, recipients: recipients.map {
            RecipientStatus(name: $0.name, kind: $0.kind,
                            notifiedAt: record.notified[$0.id], ackedAt: record.acknowledged[$0.id])
        }, sosOpen: record.sosOpen)
    }

    func endSession() async throws {
        records.removeAll()
        recipients.removeAll()
        started = false
    }

    /// Debug simulator hooks for a recipient accepting or resolving the alert.
    func acknowledge(_ escalationId: String, recipientID: UUID) async throws {
        var record = try current(escalationId)
        guard record.notified[recipientID] != nil else { throw Failure.notNotified }
        guard record.state != "resolved", record.state != "cancelled" else { return }
        if record.acknowledged[recipientID] == nil { record.acknowledged[recipientID] = clock() }
        record.state = "acknowledged"
        record.sosOpen = false
        records[escalationId] = record
    }

    func resolve(_ escalationId: String, recipientID: UUID) async throws {
        var record = try current(escalationId)
        guard let recipient = recipients.first(where: { $0.id == recipientID }),
              recipient.permissions.canResolve else { throw Failure.forbidden }
        guard record.notified[recipientID] != nil else { throw Failure.notNotified }
        guard record.state != "resolved", record.state != "cancelled" else { return }
        record.state = "resolved"
        record.sosOpen = false
        records[escalationId] = record
    }

    private func requireSession() throws {
        guard started else { throw Failure.noSession }
    }

    private func current(_ id: String) throws -> Record {
        try requireSession()
        sweep()
        guard let record = records[id] else { throw Failure.notFound }
        return record
    }

    private func sweep() {
        let now = clock()
        for id in Array(records.keys) {
            guard var record = records[id],
                  record.state == "pending" || record.state == "notifying" else { continue }
            // Preserve scheduled times so infrequent polling does not extend ack windows.
            while record.due <= now && !record.sosOpen {
                record.state = "notifying"
                if record.nextRecipient < recipients.count {
                    let recipient = recipients[record.nextRecipient]
                    record.notified[recipient.id] = record.due
                    record.nextRecipient += 1
                    record.due = record.due.addingTimeInterval(ackWindow)
                } else {
                    record.sosOpen = true
                }
            }
            records[id] = record
        }
    }
}
