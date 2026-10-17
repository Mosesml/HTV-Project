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
}
