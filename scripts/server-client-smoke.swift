// AN7 wire check: drives the real ServerClient against a running server and exits nonzero on
// the first surprise. Built and run by scripts/smoke-server-client.sh; never part of the app.
import Foundation

func fail(_ message: String) -> Never {
    print("FAIL: \(message)")
    exit(1)
}
func expect<T: Equatable>(_ actual: T, _ expected: T, _ what: String) {
    if actual != expected { fail("\(what): got \(actual), expected \(expected)") }
    print("ok   \(what)")
}

@main struct ServerClientSmoke {
    static func main() async {
        guard CommandLine.arguments.count == 2, let base = URL(string: CommandLine.arguments[1]) else {
            fail("usage: server-client-smoke <server base URL>")
        }
        do {
            let client = try ServerClient(baseURL: base)
            let primary = Contact(id: UUID(), name: "Primary", phoneE164: "+15555550101", kind: .contact, order: 0,
                                  permissions: PermissionSet(receiveAlerts: true, seeLocation: true, seeFullBrief: true, canResolve: true))
            let backup = Contact(id: UUID(), name: "Backup", phoneE164: "+15555550102", kind: .contact, order: 1,
                                 permissions: PermissionSet())
            let silent = Contact(id: UUID(), name: "Opted out", phoneE164: "+15555550103", kind: .venueStaff, order: 2,
                                 permissions: PermissionSet(receiveAlerts: false, seeLocation: false, seeFullBrief: false, canResolve: false))
            try await client.startSession(wearerName: "Smoke", selfDescription: "synthetic", recipients: [primary, backup, silent], demo: true)
            print("ok   startSession")

            let now = Date()
            func facts(_ prompts: Int, location: GeoPoint? = nil) -> BriefFacts {
                BriefFacts(wearerName: "Smoke", selfDescription: "synthetic", lastActiveState: .dancing,
                           lastActiveUntil: now.addingTimeInterval(-30),
                           trigger: MotionEvent(kind: .fall, at: now, reason: "spike 3.1 g, head 70° sideways, still 12 s",
                                                posture: Posture(pitchDeg: 70, rollDeg: 4)),
                           promptsUnanswered: prompts, location: location)
            }
            let fix = GeoPoint(lat: 43.4723, lon: -80.5449, accuracyM: 20, at: now)

            // Safe cancel before the deadline: nobody is notified.
            let first = try await client.register(deadline: now.addingTimeInterval(35), facts: facts(0, location: fix))
            try await client.update(first, facts: facts(1, location: fix))
            expect(try await client.status(first).state, "pending", "registered escalation is pending")
            try await client.cancel(first, mode: .safe)
            let cancelled = try await client.status(first)
            expect(cancelled.state, "cancelled", "safe cancel before the deadline cancels")
            expect(cancelled.recipients.compactMap(\.notifiedAt).count, 0, "nobody was notified")
            try await client.cancel(first, mode: .safe)
            print("ok   repeated cancel is accepted")
            do { try await client.update(first, facts: facts(2)); fail("update after close succeeded") }
            catch { expect(error as? ServerClientError, .rejected(code: "CLOSED"), "update after close is rejected as CLOSED") }

            // Fire now: the first consenting recipient is notified, the opted-out one never is.
            let second = try await client.register(deadline: now.addingTimeInterval(36), facts: facts(2))
            try await client.fireNow(second)
            let fired = try await client.status(second)
            expect(fired.state, "notifying", "fireNow starts the chain")
            expect(fired.recipients.map(\.name), ["Primary", "Backup"], "recipients are ordered and exclude opt-outs")
            expect(fired.recipients.first?.notifiedAt != nil, true, "first recipient has a notification time")
            expect(fired.recipients.last?.notifiedAt == nil, true, "second recipient is still waiting")
            try await client.cancel(second, mode: .safe)
            expect(try await client.status(second).state, "resolved", "late safe cancel resolves a fired escalation")

            // Duress: fires a pending escalation immediately.
            // A retried register (same deadline and trigger) gets the original escalation back.
            let third = try await client.register(deadline: now.addingTimeInterval(37), facts: facts(0))
            let retried = try await client.register(deadline: now.addingTimeInterval(37), facts: facts(0, location: fix))
            expect(retried, third, "a retried register returns the original escalation")

            try await client.cancel(third, mode: .duress)
            let duress = try await client.status(third)
            expect(duress.state, "notifying", "duress cancel fires immediately")
            expect(duress.recipients.first?.notifiedAt != nil, true, "duress notifies the first recipient")
            try await client.cancel(third, mode: .safe)
            expect(try await client.status(third).state, "notifying", "a safe cancel after duress is ignored")

            await client.heartbeat()
            print("ok   heartbeat")
            do { _ = try await client.status("00000000-0000-4000-8000-000000000000"); fail("unknown id resolved") }
            catch { expect(error as? ServerClientError, .unauthorized, "unknown escalation id is refused") }

            try await client.endSession()
            do { _ = try await client.status(third); fail("status after endSession succeeded") }
            catch { expect(error as? ServerClientError, .noSession, "calls after endSession fail locally") }
            try await client.startSession(wearerName: "Again", selfDescription: "", recipients: [], demo: true)
            do { _ = try await client.status(third); fail("old escalation visible to a new session") }
            catch { expect(error as? ServerClientError, .unauthorized, "a new session cannot read the old escalation") }
            try await client.endSession()
            print("PASS: ServerClient matches the server")
        } catch {
            fail("unexpected error: \(error)")
        }
    }
}
