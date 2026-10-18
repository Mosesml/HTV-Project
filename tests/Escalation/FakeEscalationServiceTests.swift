#if ESCALATION_STANDALONE
import Foundation
#else
import XCTest
@testable import RaveGuardEscalation
#endif

final class FakeEscalationServiceTests: XCTestCase {
    final class Clock {
        var now = Date(timeIntervalSince1970: 0)
        func advance(_ seconds: Double) { now = Date(timeIntervalSince1970: seconds) }
    }
    let primaryID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
    let backupID = UUID(uuidString: "00000000-0000-0000-0000-000000000002")!
    let staffID = UUID(uuidString: "00000000-0000-0000-0000-000000000003")!
    func contacts() -> [Contact] {
        [Contact(id: primaryID, name: "Primary", phoneE164: "+15555550101", kind: .contact, order: 0, permissions: PermissionSet()),
         Contact(id: backupID, name: "Backup", phoneE164: "+15555550102", kind: .contact, order: 1, permissions: PermissionSet()),
         Contact(id: staffID, name: "Staff", phoneE164: "+15555550103", kind: .venueStaff, order: 2, permissions: PermissionSet())]
    }
    func facts() -> BriefFacts {
        BriefFacts(wearerName: "Demo", selfDescription: "Synthetic", lastActiveState: .unknown,
                   lastActiveUntil: nil, trigger: MotionEvent(kind: .manual, at: Date(timeIntervalSince1970: 0),
                   reason: "Test", posture: nil), promptsUnanswered: 0, location: nil)
    }
    func setup(demo: Bool = true, recipients: [Contact]? = nil) async throws -> (FakeEscalationService, Clock, String) {
        let clock = Clock()
        let fake = FakeEscalationService(clock: { clock.now })
        try await fake.startSession(wearerName: "Demo", selfDescription: "Synthetic", recipients: recipients ?? contacts(), demo: demo)
        let id = try await fake.register(deadline: Date(timeIntervalSince1970: demo ? 35 : 70), facts: facts())
        return (fake, clock, id)
    }
    func testDemoDeadlineAndThreeRecipientWindows() async throws {
        let (fake, clock, id) = try await setup()
        clock.advance(34)
        var status = try await fake.status(id)
        XCTAssertEqual(status.state, "pending")
        XCTAssertEqual(status.recipients.compactMap(\.notifiedAt).count, 0)
        clock.advance(35); status = try await fake.status(id)
        XCTAssertEqual(status.state, "notifying")
        XCTAssertEqual(status.recipients.compactMap(\.notifiedAt).count, 1)
        // Demo ack windows are 10 s each (SessionTimings.demo): contacts at 35, 45, 55 s, SOS at 65 s.
        clock.advance(45); status = try await fake.status(id)
        XCTAssertEqual(status.recipients.compactMap(\.notifiedAt).count, 2)
        clock.advance(55); status = try await fake.status(id)
        XCTAssertEqual(status.recipients.compactMap(\.notifiedAt).count, 3)
        XCTAssertEqual(status.sosOpen, false)
        clock.advance(65); status = try await fake.status(id)
        XCTAssertEqual(status.sosOpen, true)
    }
    func testRealTimingCatchUpDoesNotDependOnFrequentPolling() async throws {
        let (fake, clock, id) = try await setup(demo: false)
        clock.advance(429)
        var status = try await fake.status(id)
        XCTAssertEqual(status.recipients.compactMap(\.notifiedAt), [70.0,190.0,310.0].map(Date.init(timeIntervalSince1970:)))
        XCTAssertEqual(status.sosOpen, false)
        clock.advance(430); status = try await fake.status(id)
        XCTAssertEqual(status.sosOpen, true)
    }
    func testSafeCancelBeforeDeadlineNeverNotifies() async throws {
        let (fake, clock, id) = try await setup()
        try await fake.cancel(id, mode: .safe)
        clock.advance(200)
        let status = try await fake.status(id)
        XCTAssertEqual(status.state, "cancelled")
        XCTAssertEqual(status.recipients.compactMap(\.notifiedAt).count, 0)
        XCTAssertEqual(status.sosOpen, false)
    }
    func testDuressFiresImmediatelyWithoutRestartingOnRetry() async throws {
        let (fake, clock, id) = try await setup()
        clock.advance(5); try await fake.cancel(id, mode: .duress)
        clock.advance(6); try await fake.cancel(id, mode: .duress)
        let status = try await fake.status(id)
        XCTAssertEqual(status.state, "notifying")
        XCTAssertEqual(status.recipients.first?.notifiedAt, Date(timeIntervalSince1970: 5))
    }
    func testAcknowledgeStopsChainWithoutResolving() async throws {
        let (fake, clock, id) = try await setup()
        clock.advance(35); try await fake.acknowledge(id, recipientID: primaryID)
        clock.advance(200)
        let status = try await fake.status(id)
        XCTAssertEqual(status.state, "acknowledged")
        XCTAssertEqual(status.recipients.compactMap(\.notifiedAt).count, 1)
        XCTAssertEqual(status.recipients.first?.ackedAt, Date(timeIntervalSince1970: 35))
        XCTAssertEqual(status.sosOpen, false)
    }
    func testLateSafeCancelResolvesAndStopsLaterRecipients() async throws {
        let (fake, clock, id) = try await setup()
        clock.advance(36); try await fake.cancel(id, mode: .safe)
        clock.advance(200)
        let status = try await fake.status(id)
        XCTAssertEqual(status.state, "resolved")
        XCTAssertEqual(status.recipients.compactMap(\.notifiedAt).count, 1)
    }
    func testFireNowIsIdempotentAndCannotReopenClosedRecord() async throws {
        let (fake, clock, id) = try await setup()
        try await fake.fireNow(id)
        clock.advance(1); try await fake.fireNow(id)
        var status = try await fake.status(id)
        XCTAssertEqual(status.recipients.first?.notifiedAt, Date(timeIntervalSince1970: 0))
        try await fake.resolve(id, recipientID: primaryID)
        try await fake.fireNow(id)
        status = try await fake.status(id)
        XCTAssertEqual(status.state, "resolved")
    }
    func testOptOutRecipientIsSkippedAndNonResolverIsRejected() async throws {
        var people = contacts()
        people[0].permissions.receiveAlerts = false
        people[1].permissions.canResolve = false
        let (fake, clock, id) = try await setup(recipients: people)
        clock.advance(35)
        let status = try await fake.status(id)
        XCTAssertEqual(status.recipients.first?.name, "Backup")
        do { try await fake.resolve(id, recipientID: backupID); XCTFail("Resolve must enforce permission") }
        catch FakeEscalationService.Failure.forbidden {}
    }
    func testUnnotifiedRecipientCannotAcknowledge() async throws {
        let (fake, _, id) = try await setup()
        do { try await fake.acknowledge(id, recipientID: primaryID); XCTFail("Cannot acknowledge before notification") }
        catch FakeEscalationService.Failure.notNotified {}
    }
    func testDeleteSessionRemovesEscalationsAndRequiresRestart() async throws {
        let (fake, _, id) = try await setup()
        try await fake.endSession()
        do { _ = try await fake.status(id); XCTFail("Deleted escalation should be unavailable") }
        catch FakeEscalationService.Failure.noSession {}
        do { _ = try await fake.register(deadline: Date(), facts: facts()); XCTFail("Registration requires a session") }
        catch FakeEscalationService.Failure.noSession {}
    }
    func testUnknownEscalationIsRejected() async throws {
        let (fake, _, _) = try await setup()
        do { _ = try await fake.status("unknown"); XCTFail("Unknown ID must fail") }
        catch FakeEscalationService.Failure.notFound {}
    }
    func testNoRecipientsDoesNotPretendAnAlertWasSent() async throws {
        let (fake, clock, id) = try await setup(recipients: [])
        clock.advance(35)
        let status = try await fake.status(id)
        XCTAssertEqual(status.recipients.count, 0)
        XCTAssertEqual(status.sosOpen, true)
    }
}
