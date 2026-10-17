import Foundation
import Testing
@testable import RaveGuardCore

/// J10's "Done when": the full ladder runs against Andy's `FakeEscalationService` (AN2),
/// not just this repo's scripted stand-in. The fake reads time from the test clock.
@MainActor
@Suite struct SessionAgainstFakeServiceTests {

    /// Wall time the fake actor can read off the main actor.
    final class SharedTime: @unchecked Sendable {
        private let lock = NSLock()
        private var value: Date
        init(_ d: Date) { value = d }
        var now: Date { lock.lock(); defer { lock.unlock() }; return value }
        func set(_ d: Date) { lock.lock(); value = d; lock.unlock() }
    }

    /// Passes every call through to the fake and remembers the escalation ids it hands out.
    final class Recording: EscalationService, @unchecked Sendable {
        let inner: FakeEscalationService
        private let lock = NSLock()
        private var _ids: [String] = []
        private var _calls: [String] = []
        init(_ inner: FakeEscalationService) { self.inner = inner }
        var ids: [String] { lock.lock(); defer { lock.unlock() }; return _ids }
        var calls: [String] { lock.lock(); defer { lock.unlock() }; return _calls }
        private func note(_ s: String) { lock.lock(); _calls.append(s); lock.unlock() }

        func startSession(wearerName: String, selfDescription: String, recipients: [Contact], demo: Bool) async throws {
            try await inner.startSession(wearerName: wearerName, selfDescription: selfDescription,
                                         recipients: recipients, demo: demo)
            note("startSession")
        }
        func heartbeat() async { await inner.heartbeat() }
        func register(deadline: Date, facts: BriefFacts) async throws -> String {
            let id = try await inner.register(deadline: deadline, facts: facts)
            lock.lock(); _ids.append(id); lock.unlock()
            note("register"); return id
        }
        func update(_ id: String, facts: BriefFacts) async throws { try await inner.update(id, facts: facts); note("update") }
        func cancel(_ id: String, mode: CancelMode) async throws { try await inner.cancel(id, mode: mode); note("cancel \(mode.rawValue)") }
        func fireNow(_ id: String) async throws { try await inner.fireNow(id); note("fireNow") }
        func status(_ id: String) async throws -> EscalationStatus { try await inner.status(id) }
        func endSession() async throws { try await inner.endSession(); note("endSession") }
    }

    @MainActor
    final class Harness {
        let clock = ManualSessionClock()
        let time: SharedTime
        let fake: FakeEscalationService
        let service: Recording
        let log = MemoryLog()
        let session: SessionManager
        let contacts: [Contact]
        private(set) var phases: [SessionPhase] = []
        private(set) var statuses: [EscalationStatus] = []

        init(demo: Bool = true) {
            time = SharedTime(clock.now)
            let t = time
            fake = FakeEscalationService(clock: { t.now })
            service = Recording(fake)
            contacts = [
                Contact(id: UUID(), name: "Sam", phoneE164: "+15555550101", kind: .contact, order: 0,
                        permissions: PermissionSet(seeLocation: true, seeFullBrief: true)),
                Contact(id: UUID(), name: "Riley", phoneE164: "+15555550102", kind: .contact, order: 1,
                        permissions: PermissionSet()),
                Contact(id: UUID(), name: "Front desk", phoneE164: "+15555550103", kind: .venueStaff, order: 2,
                        permissions: PermissionSet(seeLocation: true)),
            ]
            session = SessionManager(
                config: SessionManagerConfig(wearerName: "Alex", selfDescription: "black hoodie",
                                             recipients: contacts, demo: demo, teammatePhone: "+15555550123"),
                clock: clock, escalation: service, log: log)
            session.onPhase = { [unowned self] in self.phases.append($0) }
            session.onEscalation = { [unowned self] in self.statuses.append($0) }
        }

        func advance(_ seconds: TimeInterval) async {
            var left = seconds
            while left > 0 {
                let step = min(1, left)
                clock.advance(by: step)
                time.set(clock.now)
                left -= step
                await session.settle()
            }
        }

        func fireFall() async {
            session.debugFire(2)
            await session.settle()
        }

        var escalationId: String? { service.ids.last }
    }

    @Test func scenario1NodCancelsAndNothingIsSent() async throws {
        let h = Harness()
        await h.fireFall()
        await h.advance(5)
        h.session.handleNod(at: h.clock.now)
        await h.advance(60)
        #expect(h.session.phase == .monitoring)
        let status = try await h.fake.status(try #require(h.escalationId))
        #expect(status.state == "cancelled")
        #expect(status.recipients.allSatisfy { $0.notifiedAt == nil })
    }

    @Test func scenarios2And5RunTheChainToSOSAt95Seconds() async throws {
        let h = Harness()
        await h.fireFall()
        await h.advance(35)
        #expect(h.session.phase == .escalated(escalationId: try #require(h.escalationId)))
        await h.advance(3)
        #expect(h.statuses.last?.recipients.first { $0.notifiedAt != nil }?.name == "Sam")
        await h.advance(55)   // 93 s
        #expect(h.session.phase != .sos)
        await h.advance(4)    // next poll after 95 s
        #expect(h.session.phase == .sos)
        let notified = h.statuses.last?.recipients.filter { $0.notifiedAt != nil }.map(\.name)
        #expect(notified == ["Sam", "Riley", "Front desk"])
        #expect(h.log.kinds.filter { $0 == .recipientNotified }.count == 3)
    }

    @Test func scenario3DuressFiresButTheWearerSeesASafeCancel() async throws {
        let h = Harness()
        await h.fireFall()
        await h.advance(21)   // PIN gate
        h.session.pinResult(.duress)
        await h.advance(30)
        #expect(h.session.phase == .monitoring)
        #expect(h.statuses.isEmpty)
        let status = try await h.fake.status(try #require(h.escalationId))
        #expect(status.state == "notifying")
        #expect(status.recipients.first?.notifiedAt != nil)
        // Contact 1 was notified at the duress moment, not at the original deadline.
        #expect(status.recipients.first!.notifiedAt! < h.clock.now.addingTimeInterval(-20))
    }

    @Test func scenario5AckStopsTheChainThenResolveReturnsToMonitoring() async throws {
        let h = Harness()
        await h.fireFall()
        await h.advance(40)
        let id = try #require(h.escalationId)
        try await h.fake.acknowledge(id, recipientID: h.contacts[0].id)
        await h.advance(60)
        #expect(h.session.phase == .escalated(escalationId: id))   // no SOS after an ack
        #expect(h.statuses.last?.state == "acknowledged")
        #expect(h.log.kinds.contains(.recipientAcked))
        #expect(h.statuses.last?.recipients[1].notifiedAt == nil)  // Contact 2 never texted
        try await h.fake.resolve(id, recipientID: h.contacts[0].id)
        await h.advance(4)
        #expect(h.session.phase == .monitoring)
        #expect(h.log.kinds.last == .resolved)
    }

    @Test func scenario6TapBeforeTheDeadlineCancels() async throws {
        let h = Harness()
        await h.fireFall()
        await h.advance(12)   // loud prompt
        h.session.tapCancel()
        await h.advance(120)
        #expect(h.session.phase == .monitoring)
        #expect(try await h.fake.status(try #require(h.escalationId)).state == "cancelled")
    }

    @Test func lateSafePinResolvesTheFiredEscalation() async throws {
        let h = Harness()
        await h.fireFall()
        await h.advance(45)
        h.session.pinResult(.safe)
        await h.advance(4)
        #expect(h.session.phase == .monitoring)
        #expect(try await h.fake.status(try #require(h.escalationId)).state == "resolved")
    }

    @Test func threeWrongPinsFireBeforeTheDeadline() async throws {
        let h = Harness()
        let start = h.clock.now
        await h.fireFall()
        await h.advance(21)
        for _ in 0..<3 { h.session.pinResult(.wrong) }
        await h.advance(1)
        let status = try await h.fake.status(try #require(h.escalationId))
        let notifiedAt = try #require(status.recipients.first?.notifiedAt)
        #expect(notifiedAt < start.addingTimeInterval(35))   // fired early, not at the deadline
        #expect(h.service.calls.contains("fireNow"))
    }

    @Test func stopEndsTheFakeSessionAndARestartWorks() async throws {
        let h = Harness()
        h.session.start()
        await h.advance(1)
        #expect(h.session.stop())
        await h.advance(1)
        h.session.start()   // the fake throws alreadyStarted unless the first session ended
        await h.advance(1)
        #expect(h.service.calls == ["startSession", "endSession", "startSession"])
        await h.fireFall()
        #expect(h.service.ids.count == 1)
    }

    @Test func realTimingsSOSAt7Min10() async throws {
        let h = Harness(demo: false)
        await h.fireFall()
        await h.advance(428)
        #expect(h.session.phase == .escalated(escalationId: try #require(h.escalationId)))
        await h.advance(4)
        #expect(h.session.phase == .sos)
    }
}
