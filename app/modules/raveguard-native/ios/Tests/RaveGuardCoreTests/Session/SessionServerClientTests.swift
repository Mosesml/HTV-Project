import Foundation
import Testing
@testable import RaveGuardCore

/// J12 server half: which escalation backend the runtime builds.
@Suite struct EscalationBackendSelectionTests {

    @Test func usesServerClientForAnHTTPSURL() {
        let picked = RaveGuardRuntime.escalationService(serverURL: "https://raveguard.example.com")
        #expect(picked.service is ServerClient)
        #expect(picked.backend == "server https://raveguard.example.com")
    }

    @Test func allowsPlainHTTPOnlyForLoopback() {
        #expect(RaveGuardRuntime.escalationService(serverURL: "http://localhost:8787").service is ServerClient)
        #expect(RaveGuardRuntime.escalationService(serverURL: "http://192.168.1.20:8787").service is FakeEscalationService)
    }

    @Test(arguments: [nil, "", "   ", "not a url", "ftp://example.com"] as [String?])
    func fallsBackToTheFake(_ value: String?) {
        let picked = RaveGuardRuntime.escalationService(serverURL: value)
        #expect(picked.service is FakeEscalationService)
        #expect(picked.backend.hasPrefix("fake"))
    }

    @Test func ignoresANonStringPlistValue() {
        #expect(RaveGuardRuntime.escalationService(serverURL: 42).service is FakeEscalationService)
    }
}

/// End to end against a running escalation server, in real time (about 45 s):
///
///     cd server && PORT=8787 DEMO_SMS=simulate npm start      # any local or hosted server
///     RG_E2E_SERVER_URL=http://localhost:8787 swift test --filter SessionServerClientE2E
///
/// Skipped unless `RG_E2E_SERVER_URL` is set.
@MainActor
@Suite(.enabled(if: ProcessInfo.processInfo.environment["RG_E2E_SERVER_URL"] != nil))
struct SessionServerClientE2ETests {

    private func makeSession() throws -> (SessionManager, ServerClient, MemoryLog) {
        let url = URL(string: ProcessInfo.processInfo.environment["RG_E2E_SERVER_URL"]!)!
        let client = try ServerClient(baseURL: url)
        let log = MemoryLog()
        let recipients = [
            Contact(id: UUID(), name: "Sam", phoneE164: "+15555550101", kind: .contact, order: 0,
                    permissions: PermissionSet(seeLocation: true, seeFullBrief: true)),
            Contact(id: UUID(), name: "Riley", phoneE164: "+15555550102", kind: .contact, order: 1,
                    permissions: PermissionSet()),
        ]
        let session = SessionManager(
            config: SessionManagerConfig(wearerName: "E2E", selfDescription: "test run",
                                         recipients: recipients, demo: true),
            clock: SystemSessionClock(), escalation: client, log: log)
        return (session, client, log)
    }

    private func wait(_ seconds: Double, until done: () -> Bool = { false }) async {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end && !done() { try? await Task.sleep(nanoseconds: 200_000_000) }
    }

    @Test func nodCancelsOnTheRealServer() async throws {
        let (session, client, log) = try makeSession()
        session.debugFire(1)
        await wait(5) { log.kinds.contains(.checkInStarted) }
        await wait(2)   // let register land
        session.handleNod(at: Date())
        await wait(3)
        #expect(session.phase == .monitoring)
        #expect(session.stop())
        await wait(2)
        _ = client
    }

    @Test func noAnswerEscalatesAndTheServerNotifiesContact1() async throws {
        let (session, _, log) = try makeSession()
        var statuses: [EscalationStatus] = []
        session.onEscalation = { statuses.append($0) }
        session.debugFire(2)
        await wait(45) { statuses.contains { $0.recipients.contains { $0.notifiedAt != nil } } }
        guard case let .escalated(id) = session.phase else {
            Issue.record("expected escalated, got \(session.phase)"); return
        }
        #expect(!id.isEmpty)
        #expect(statuses.last?.state == "notifying")
        #expect(statuses.last?.recipients.first { $0.notifiedAt != nil }?.name == "Sam")
        #expect(log.kinds.contains(.recipientNotified))
        // Clean up: a late safe cancel resolves it, then the session can stop.
        session.pinResult(.safe)
        await wait(3)
        #expect(session.phase == .monitoring)
        #expect(session.stop())
        await wait(2)
    }

    /// AN10: the server accepts a location in register and in an update (a mismatch here would be
    /// swallowed by SessionManager's best-effort update, so it is checked directly).
    @Test func theServerAcceptsALocationFromThePhone() async throws {
        let url = URL(string: ProcessInfo.processInfo.environment["RG_E2E_SERVER_URL"]!)!
        let client = try ServerClient(baseURL: url)
        let contact = Contact(id: UUID(), name: "Sam", phoneE164: "+15555550101", kind: .contact, order: 0,
                              permissions: PermissionSet(seeLocation: true, seeFullBrief: true))
        try await client.startSession(wearerName: "E2E", selfDescription: "", recipients: [contact], demo: true)
        let trigger = MotionEvent(kind: .fall, at: Date(), reason: "e2e", posture: nil)
        let here = GeoPoint(lat: 43.472391, lon: -80.544913, accuracyM: 12.4, at: Date())
        let facts = BriefFacts(wearerName: "E2E", selfDescription: "", lastActiveState: .dancing,
                               lastActiveUntil: Date(), trigger: trigger, promptsUnanswered: 0, location: here)
        let id = try await client.register(deadline: Date().addingTimeInterval(35), facts: facts)
        try await client.update(id, facts: facts.with(location: GeoPoint(lat: 43.48, lon: -80.53, accuracyM: 8, at: Date())))
        try await client.cancel(id, mode: .safe)
        try await client.endSession()
    }

    /// J15 end to end: a responder 100 m away is texted after Contact 1, and the phone decodes it.
    @Test func aNearbyResponderIsNotifiedAfterTheContacts() async throws {
        let url = URL(string: ProcessInfo.processInfo.environment["RG_E2E_SERVER_URL"]!)!
        let here = GeoPoint(lat: 43.472391, lon: -80.544913, accuracyM: 12, at: Date())
        let responder = try ServerClient(baseURL: url)
        try await responder.startSession(wearerName: "Riley", selfDescription: "", recipients: [], demo: true)
        try await responder.reportResponder(name: "Riley", phoneE164: "+15555550202",
                                            fix: GeoPoint(lat: here.lat + 100 / 111_320, lon: here.lon, accuracyM: 10, at: Date()))
        let wearer = try ServerClient(baseURL: url)
        let contact = Contact(id: UUID(), name: "Sam", phoneE164: "+15555550101", kind: .contact, order: 0,
                              permissions: PermissionSet(seeLocation: true, seeFullBrief: true))
        try await wearer.startSession(wearerName: "E2E", selfDescription: "", recipients: [contact], demo: true)
        let facts = BriefFacts(wearerName: "E2E", selfDescription: "", lastActiveState: .dancing, lastActiveUntil: nil,
                               trigger: MotionEvent(kind: .fall, at: Date(), reason: "e2e", posture: nil),
                               promptsUnanswered: 2, location: here)
        let id = try await wearer.register(deadline: Date().addingTimeInterval(1), facts: facts)
        var status = try await wearer.status(id)
        for _ in 0..<30 where !status.recipients.contains(where: { $0.kind == .nearby && $0.notifiedAt != nil }) {
            try await Task.sleep(nanoseconds: 500_000_000)
            status = try await wearer.status(id)
        }
        #expect(status.recipients.map(\.kind) == [.contact, .nearby])
        #expect(status.recipients.last?.name == "Riley")
        let contactAt = try #require(status.recipients.first?.notifiedAt)
        let nearbyAt = try #require(status.recipients.last?.notifiedAt)
        #expect(nearbyAt.timeIntervalSince(contactAt) >= 9, "after Contact 1's window")
        try await wearer.cancel(id, mode: .safe)
        try await wearer.endSession()
        await responder.clearResponder()
        try await responder.endSession()
    }
}
