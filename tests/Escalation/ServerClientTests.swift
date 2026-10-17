#if ESCALATION_STANDALONE
import Foundation
#else
import XCTest
@testable import RaveGuardEscalation
#endif

// AN7: ServerClient against a scripted transport. No network; time moves only when a test says so.

final class StubTransport: HTTPTransport, @unchecked Sendable {
    enum Reply { case status(Int, String), offline }
    struct Call {
        let method: String, path: String, authorization: String?, contentType: String?
        let body: [String: Any]?
        var key: String { "\(method) \(path)" }
    }
    struct Offline: Error {}

    private let lock = NSLock()
    private var recorded: [Call] = []
    private var queues: [(match: String, replies: [Reply])] = []

    var calls: [Call] { lock.withLock { recorded } }
    func calls(_ match: String) -> [Call] { calls.filter { $0.key.contains(match) } }

    /// The next requests whose "METHOD /path" contains `match` get these replies, in order;
    /// after that the happy-path reply applies.
    func script(_ match: String, _ replies: [Reply]) { lock.withLock { queues.append((match, replies)) } }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let url = request.url!
        let body = request.httpBody.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let call = Call(method: request.httpMethod ?? "", path: url.path,
                        authorization: request.value(forHTTPHeaderField: "Authorization"),
                        contentType: request.value(forHTTPHeaderField: "Content-Type"), body: body)
        let reply: Reply = lock.withLock {
            recorded.append(call)
            if let i = queues.firstIndex(where: { call.key.contains($0.match) && !$0.replies.isEmpty }) {
                return queues[i].replies.removeFirst()
            }
            return StubTransport.happy(call)
        }
        switch reply {
        case .offline: throw Offline()
        case let .status(code, text):
            let response = HTTPURLResponse(url: url, statusCode: code, httpVersion: nil, headerFields: nil)!
            return (Data(text.utf8), response)
        }
    }

    static let token = String(repeating: "t", count: 43)
    static let statusJSON = """
    {"ok":true,"data":{"state":"notifying","recipients":[
    {"name":"Primary","kind":"contact","notifiedAt":"2027-01-15T08:00:35.000Z","ackedAt":null},
    {"name":"Staff","kind":"venueStaff","notifiedAt":null,"ackedAt":null}],"sosOpen":false},"error":null}
    """

    static func happy(_ call: Call) -> Reply {
        switch (call.method, call.path) {
        case ("POST", "/v1/sessions"):
            return .status(201, #"{"ok":true,"data":{"sessionId":"sess-1","token":"\#(token)"},"error":null}"#)
        case ("POST", let p) where p.hasSuffix("/escalations"):
            return .status(201, #"{"ok":true,"data":{"escalationId":"esc-1"},"error":null}"#)
        case ("GET", _): return .status(200, statusJSON)
        default: return .status(204, "")
        }
    }
}

/// Sleeps in `hold` suspend until `release()` (or cancellation); every other sleep returns at
/// once. Every requested duration is recorded.
actor TestSleeper {
    private let hold: Set<TimeInterval>
    private var waiting: [(id: Int, continuation: CheckedContinuation<Void, Error>)] = []
    private var nextID = 0
    private(set) var durations: [TimeInterval] = []

    init(hold: Set<TimeInterval>) { self.hold = hold }

    var sleeping: Int { waiting.count }
    func durations(except ignored: TimeInterval) -> [TimeInterval] { durations.filter { $0 != ignored } }

    func sleep(_ seconds: TimeInterval) async throws {
        durations.append(seconds)
        if Task.isCancelled { throw CancellationError() }
        guard hold.contains(seconds) else { return }
        let id = nextID; nextID += 1
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
                waiting.append((id, c))
            }
        } onCancel: {
            Task { await self.cancelWaiter(id) }
        }
    }

    func release() {
        let released = waiting
        waiting = []
        released.forEach { $0.continuation.resume() }
    }

    private func cancelWaiter(_ id: Int) {
        guard let i = waiting.firstIndex(where: { $0.id == id }) else { return }
        waiting.remove(at: i).continuation.resume(throwing: CancellationError())
    }
}

final class TestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var current = Date(timeIntervalSince1970: 1_800_000_000)
    var now: Date { lock.withLock { current } }
    func advance(_ seconds: TimeInterval) { lock.withLock { current = current.addingTimeInterval(seconds) } }
}

struct Rig {
    let client: ServerClient
    let transport = StubTransport()
    let sleeper: TestSleeper
    let clock = TestClock()

    init(hold extra: Set<TimeInterval> = [], timing: ServerClient.Timing = .init()) throws {
        sleeper = TestSleeper(hold: extra.union([timing.heartbeatInterval]))
        let transport = self.transport, sleeper = self.sleeper, clock = self.clock
        client = try ServerClient(baseURL: URL(string: "https://rg.example.com")!, transport: transport,
                                  timing: timing, sleep: { try await sleeper.sleep($0) }, now: { clock.now })
    }

    func started(demo: Bool = true) async throws -> Rig {
        try await client.startSession(wearerName: "Alex", selfDescription: "black hoodie",
                                      recipients: Fixtures.contacts(), demo: demo)
        return self
    }
}

enum Fixtures {
    static func contacts() -> [Contact] {
        [Contact(id: UUID(uuidString: "00000000-0000-4000-8000-000000000001")!, name: "Primary",
                 phoneE164: "+15555550101", kind: .contact, order: 0,
                 permissions: PermissionSet(receiveAlerts: true, seeLocation: true, seeFullBrief: true, canResolve: true)),
         Contact(id: UUID(uuidString: "00000000-0000-4000-8000-000000000002")!, name: "Staff",
                 phoneE164: "+15555550102", kind: .venueStaff, order: 1, permissions: PermissionSet())]
    }
    static func facts(location: GeoPoint? = nil) -> BriefFacts {
        BriefFacts(wearerName: "Alex", selfDescription: "black hoodie", lastActiveState: .dancing,
                   lastActiveUntil: nil,
                   trigger: MotionEvent(kind: .fall, at: Date(timeIntervalSince1970: 1_800_000_000),
                                        reason: "spike 3.1 g", posture: Posture(pitchDeg: 70, rollDeg: 4)),
                   promptsUnanswered: 2, location: location)
    }
}

func waitUntil(_ what: String, _ condition: () async -> Bool) async {
    for _ in 0..<3000 {
        if await condition() { return }
        try? await Task.sleep(nanoseconds: 1_000_000)
    }
    XCTFail("timed out waiting for \(what)")
}

func settle() async { try? await Task.sleep(nanoseconds: 50_000_000) }

final class ServerClientTests: XCTestCase {
    func fails(_ expected: ServerClientError, _ work: () async throws -> Void,
               file: StaticString = #filePath, line: UInt = #line) async {
        do {
            try await work()
            XCTFail("expected \(expected), but the call succeeded", file: file, line: line)
        } catch {
            XCTAssertEqual(error as? ServerClientError, expected, file: file, line: line)
        }
    }
    func object(_ value: Any?) -> [String: Any] { (value as? [String: Any]) ?? [:] }

    // MARK: Wire format

    func testStartSessionPostsSettingsWithoutCredentials() async throws {
        let rig = try await Rig().started()
        let call = rig.transport.calls[0]
        XCTAssertEqual(call.key, "POST /v1/sessions")
        XCTAssertEqual(call.authorization, nil)
        XCTAssertEqual(call.contentType, "application/json")
        XCTAssertEqual(call.body?["wearerName"] as? String, "Alex")
        XCTAssertEqual(call.body?["selfDescription"] as? String, "black hoodie")
        XCTAssertEqual(call.body?["demo"] as? Bool, true)
        let recipients = call.body?["recipients"] as? [[String: Any]] ?? []
        XCTAssertEqual(recipients.count, 2)
        XCTAssertEqual(recipients[0]["phoneE164"] as? String, "+15555550101")
        XCTAssertEqual(recipients[1]["kind"] as? String, "venueStaff")
        XCTAssertEqual(object(recipients[0]["permissions"]).keys.sorted(),
                       ["canResolve", "receiveAlerts", "seeFullBrief", "seeLocation"])
        XCTAssertEqual(Set(call.body?.keys.map { $0 } ?? []), ["wearerName", "selfDescription", "recipients", "demo"])
    }

    func testRegisterSendsDeadlineAndFactsWithTheSessionToken() async throws {
        let rig = try await Rig().started()
        let deadline = Date(timeIntervalSince1970: 1_800_000_035.5)
        let id = try await rig.client.register(deadline: deadline, facts: Fixtures.facts())
        XCTAssertEqual(id, "esc-1")
        let call = rig.transport.calls[1]
        XCTAssertEqual(call.key, "POST /v1/sessions/sess-1/escalations")
        XCTAssertEqual(call.authorization, "Bearer \(StubTransport.token)")
        XCTAssertEqual(call.body?["deadline"] as? String, "2027-01-15T08:00:35.500Z")
        let facts = object(call.body?["facts"])
        XCTAssertEqual(facts["lastActiveState"] as? String, "dancing")
        XCTAssertEqual(facts["promptsUnanswered"] as? Int, 2)
        XCTAssertEqual(facts["location"] == nil, true)
        XCTAssertEqual(facts["lastActiveUntil"] == nil, true)
        let trigger = object(facts["trigger"])
        XCTAssertEqual(trigger["kind"] as? String, "fall")
        XCTAssertEqual(trigger["at"] as? String, "2027-01-15T08:00:00.000Z")
        XCTAssertEqual(object(trigger["posture"])["pitchDeg"] as? Double, 70)
    }

    func testLocationIsSentOnlyWhenTheFactsCarryIt() async throws {
        let rig = try await Rig().started()
        let fix = GeoPoint(lat: 43.47, lon: -80.54, accuracyM: 12, at: Date(timeIntervalSince1970: 1_800_000_010))
        let id = try await rig.client.register(deadline: Date(), facts: Fixtures.facts(location: fix))
        try await rig.client.update(id, facts: Fixtures.facts())
        let located = object(object(rig.transport.calls[1].body?["facts"])["location"])
        XCTAssertEqual(located["lat"] as? Double, 43.47)
        XCTAssertEqual(located["at"] as? String, "2027-01-15T08:00:10.000Z")
        XCTAssertEqual(object(rig.transport.calls[2].body?["facts"])["location"] == nil, true)
    }

    func testUpdateFireAndCancelUseTheDocumentedRoutesAndBodies() async throws {
        let rig = try await Rig().started()
        try await rig.client.update("esc-1", facts: Fixtures.facts())
        try await rig.client.fireNow("esc-1")
        try await rig.client.cancel("esc-1", mode: .safe)
        let calls = rig.transport.calls
        XCTAssertEqual(calls[1].key, "PATCH /v1/escalations/esc-1")
        XCTAssertEqual(object(calls[1].body?["facts"])["wearerName"] as? String, "Alex")
        XCTAssertEqual(calls[2].key, "POST /v1/escalations/esc-1/fire")
        XCTAssertEqual((calls[2].body?["reason"] as? String)?.isEmpty, false)
        XCTAssertEqual(calls[3].key, "POST /v1/escalations/esc-1/cancel")
        XCTAssertEqual(calls[3].body?["mode"] as? String, "safe")
        XCTAssertEqual(calls.dropFirst().map(\.authorization), Array(repeating: "Bearer \(StubTransport.token)", count: 3))
    }

    func testDuressCancelSendsDuressMode() async throws {
        let rig = try await Rig().started()
        try await rig.client.cancel("esc-1", mode: .duress)
        XCTAssertEqual(rig.transport.calls[1].body?["mode"] as? String, "duress")
        XCTAssertEqual(rig.transport.calls[1].body?.count, 1)
    }

    func testStatusDecodesRecipientTimesAndNulls() async throws {
        let rig = try await Rig().started()
        let status = try await rig.client.status("esc-1")
        XCTAssertEqual(rig.transport.calls[1].key, "GET /v1/escalations/esc-1")
        XCTAssertEqual(rig.transport.calls[1].body == nil, true)
        XCTAssertEqual(status, EscalationStatus(state: "notifying", recipients: [
            RecipientStatus(name: "Primary", kind: .contact,
                            notifiedAt: Date(timeIntervalSince1970: 1_800_000_035), ackedAt: nil),
            RecipientStatus(name: "Staff", kind: .venueStaff, notifiedAt: nil, ackedAt: nil)], sosOpen: false))
    }

    // MARK: Heartbeat

    func testHeartbeatLoopSendsEveryTenSeconds() async throws {
        let rig = try await Rig().started()
        await waitUntil("first sleep") { await rig.sleeper.sleeping == 1 }
        let observed1 = await rig.sleeper.durations
        XCTAssertEqual(observed1, [10])
        XCTAssertEqual(rig.transport.calls("heartbeat").count, 0)
        rig.clock.advance(10); await rig.sleeper.release()
        await waitUntil("first heartbeat") { rig.transport.calls("heartbeat").count == 1 }
        await waitUntil("second sleep") { await rig.sleeper.sleeping == 1 }
        rig.clock.advance(10); await rig.sleeper.release()
        await waitUntil("second heartbeat") { rig.transport.calls("heartbeat").count == 2 }
        let beat = rig.transport.calls("heartbeat")[0]
        XCTAssertEqual(beat.key, "POST /v1/sessions/sess-1/heartbeat")
        XCTAssertEqual(beat.authorization, "Bearer \(StubTransport.token)")
        XCTAssertEqual(beat.body == nil, true)
        let observed2 = await rig.sleeper.durations
        XCTAssertEqual(observed2, [10, 10, 10])
    }

    func testSessionHeartbeatNudgeIsCoalescedWithTheLoop() async throws {
        let rig = try await Rig().started()
        await rig.client.heartbeat()                       // the session just started: nothing owed
        XCTAssertEqual(rig.transport.calls("heartbeat").count, 0)
        rig.clock.advance(6); await rig.client.heartbeat()
        XCTAssertEqual(rig.transport.calls("heartbeat").count, 1)
        await rig.client.heartbeat()                       // same instant: coalesced
        rig.clock.advance(4); await rig.client.heartbeat() // 4 s after the last one: still coalesced
        XCTAssertEqual(rig.transport.calls("heartbeat").count, 1)
        rig.clock.advance(1); await rig.client.heartbeat()
        XCTAssertEqual(rig.transport.calls("heartbeat").count, 2)
    }

    func testAFailedHeartbeatDoesNotStopTheLoop() async throws {
        let rig = try await Rig().started()
        rig.transport.script("heartbeat", [.offline])
        await waitUntil("sleep") { await rig.sleeper.sleeping == 1 }
        rig.clock.advance(10); await rig.sleeper.release()
        await waitUntil("failed beat") { rig.transport.calls("heartbeat").count == 1 }
        await waitUntil("sleep again") { await rig.sleeper.sleeping == 1 }
        rig.clock.advance(10); await rig.sleeper.release()
        await waitUntil("next beat") { rig.transport.calls("heartbeat").count == 2 }
    }

    func testTheLoopStopsWhenTheServerForgetsTheSession() async throws {
        let rig = try await Rig().started()
        rig.transport.script("heartbeat", [.status(401, #"{"ok":false,"data":null,"error":{"code":"UNAUTHORIZED","message":"x"}}"#)])
        await waitUntil("sleep") { await rig.sleeper.sleeping == 1 }
        rig.clock.advance(10); await rig.sleeper.release()
        await waitUntil("rejected beat") { rig.transport.calls("heartbeat").count == 1 }
        await settle()
        let observed3 = await rig.sleeper.sleeping
        XCTAssertEqual(observed3, 0)
        let observed4 = await rig.sleeper.durations.count
        XCTAssertEqual(observed4, 1)
    }

    func testEndSessionDeletesTheRecordAndStopsTheHeartbeat() async throws {
        let rig = try await Rig().started()
        await waitUntil("sleep") { await rig.sleeper.sleeping == 1 }
        try await rig.client.endSession()
        let delete = rig.transport.calls("DELETE")
        XCTAssertEqual(delete.map(\.key), ["DELETE /v1/sessions/sess-1"])
        XCTAssertEqual(delete[0].authorization, "Bearer \(StubTransport.token)")
        await waitUntil("loop stopped") { await rig.sleeper.sleeping == 0 }
        rig.clock.advance(60); await rig.sleeper.release(); await settle()
        XCTAssertEqual(rig.transport.calls("heartbeat").count, 0)
        await fails(.noSession) { _ = try await rig.client.register(deadline: Date(), facts: Fixtures.facts()) }
        try await rig.client.endSession()                  // idempotent
        XCTAssertEqual(rig.transport.calls("DELETE").count, 1)
    }

    func testANewSessionAfterEndSessionGetsItsOwnHeartbeat() async throws {
        let rig = try await Rig().started()
        try await rig.client.endSession()
        await waitUntil("old loop gone") { await rig.sleeper.sleeping == 0 }
        try await rig.client.startSession(wearerName: "Alex", selfDescription: "", recipients: [], demo: true)
        await waitUntil("new loop") { await rig.sleeper.sleeping == 1 }
        rig.clock.advance(10); await rig.sleeper.release()
        await waitUntil("new beat") { rig.transport.calls("heartbeat").count == 1 }
    }

    // MARK: Cancel retry

    func testCancelRetriesUntilTheServerAccepts() async throws {
        let rig = try await Rig().started()
        rig.transport.script("/cancel", [.offline, .status(503, ""), .status(429, ""), .status(204, "")])
        try await rig.client.cancel("esc-1", mode: .safe)
        XCTAssertEqual(rig.transport.calls("/cancel").count, 4)
        let observed5 = await rig.sleeper.durations(except: 10)
        XCTAssertEqual(observed5, [0.5, 1, 2])
        try await rig.client.cancel("esc-1", mode: .safe)  // landed: a new cancel is a new request
        XCTAssertEqual(rig.transport.calls("/cancel").count, 5)
    }

    func testCancelBackoffIsCapped() async throws {
        let rig = try await Rig().started()
        rig.transport.script("/cancel", Array(repeating: .offline, count: 6))
        try await rig.client.cancel("esc-1", mode: .duress)
        let observed6 = await rig.sleeper.durations(except: 10)
        XCTAssertEqual(observed6, [0.5, 1, 2, 4, 5, 5])
        XCTAssertEqual(rig.transport.calls("/cancel").count, 7)
    }

    func testCancelStopsOnAPermanentRejection() async throws {
        let rig = try await Rig().started()
        rig.transport.script("/cancel", [.status(400, #"{"ok":false,"data":null,"error":{"code":"INVALID_REQUEST","message":"x"}}"#)])
        await fails(.rejected(code: "INVALID_REQUEST")) { try await rig.client.cancel("esc-1", mode: .safe) }
        rig.transport.script("/cancel", [.status(401, "")])
        await fails(.unauthorized) { try await rig.client.cancel("esc-1", mode: .safe) }
        rig.transport.script("/cancel", [.status(404, "")])
        await fails(.notFound) { try await rig.client.cancel("esc-1", mode: .safe) }
        XCTAssertEqual(rig.transport.calls("/cancel").count, 3)
        let observed7 = await rig.sleeper.durations(except: 10)
        XCTAssertEqual(observed7, [])
    }

    func testDuressUpgradesACancelThatIsStillRetrying() async throws {
        let rig = try await Rig(hold: [0.5]).started()
        rig.transport.script("/cancel", [.offline])
        let safe = Task { try await rig.client.cancel("esc-1", mode: .safe) }
        await waitUntil("retry wait") { await rig.sleeper.sleeping == 2 }   // heartbeat + the retry
        let duress = Task { try await rig.client.cancel("esc-1", mode: .duress) }
        await settle()
        await rig.sleeper.release()
        try await safe.value
        try await duress.value
        let cancels = rig.transport.calls("/cancel")
        XCTAssertEqual(cancels.map { $0.body?["mode"] as? String }, ["safe", "duress"])
    }

    func testASafeCancelNeverFollowsADuressOneThatLanded() async throws {
        let rig = try await Rig().started()
        try await rig.client.cancel("esc-1", mode: .duress)
        try await rig.client.cancel("esc-1", mode: .safe)
        XCTAssertEqual(rig.transport.calls("/cancel").map { $0.body?["mode"] as? String }, ["duress"])
    }

    func testEndSessionStopsACancelThatIsStillRetrying() async throws {
        let rig = try await Rig(hold: [0.5]).started()
        rig.transport.script("/cancel", Array(repeating: .offline, count: 50))
        let pending = Task { try await rig.client.cancel("esc-1", mode: .safe) }
        await waitUntil("retry wait") { await rig.sleeper.sleeping == 2 }
        try await rig.client.endSession()
        let result = await pending.result
        if case .success = result { XCTFail("the cancel should not report success") }
        await settle()
        XCTAssertEqual(rig.transport.calls("/cancel").count, 1)
    }

    // MARK: End of session

    func testEndSessionRetriesTheDeleteThenGivesUp() async throws {
        let rig = try await Rig().started()
        rig.transport.script("DELETE", [.status(503, ""), .offline, .status(204, "")])
        try await rig.client.endSession()
        XCTAssertEqual(rig.transport.calls("DELETE").count, 3)

        let failing = try await Rig().started()
        failing.transport.script("DELETE", [.offline, .offline, .offline, .offline])
        await fails(.transport) { try await failing.client.endSession() }
        XCTAssertEqual(failing.transport.calls("DELETE").count, 3)
    }

    func testEndSessionTreatsAnUnknownSessionAsAlreadyDeleted() async throws {
        let rig = try await Rig().started()
        rig.transport.script("DELETE", [.status(401, "")])
        try await rig.client.endSession()
        XCTAssertEqual(rig.transport.calls("DELETE").count, 1)
    }

    // MARK: Errors

    func testCallsNeedAStartedSessionAndASecondStartIsRefused() async throws {
        let rig = try Rig()
        await fails(.noSession) { _ = try await rig.client.status("esc-1") }
        await fails(.noSession) { try await rig.client.cancel("esc-1", mode: .safe) }
        XCTAssertEqual(rig.transport.calls.count, 0)
        _ = try await rig.started()
        await fails(.alreadyStarted) {
            try await rig.client.startSession(wearerName: "A", selfDescription: "", recipients: [], demo: true)
        }
    }

    func testPlainHTTPIsRefusedExceptOnLoopback() async throws {
        for bad in ["http://rg.example.com", "ftp://rg.example.com", "https:///nohost"] {
            do { _ = try ServerClient(baseURL: URL(string: bad)!); XCTFail("accepted \(bad)") }
            catch { XCTAssertEqual(error as? ServerClientError, .insecureURL) }
        }
        _ = try ServerClient(baseURL: URL(string: "http://localhost:3000")!)
        _ = try ServerClient(baseURL: URL(string: "http://127.0.0.1:3000")!)
        _ = try ServerClient(baseURL: URL(string: "https://rg.example.com")!)
    }

    func testServerErrorsMapToNamedCases() async throws {
        let rig = try await Rig().started()
        rig.transport.script("PATCH", [.status(409, #"{"ok":false,"data":null,"error":{"code":"CLOSED","message":"Escalation is closed"}}"#)])
        await fails(.rejected(code: "CLOSED")) { try await rig.client.update("esc-1", facts: Fixtures.facts()) }
        rig.transport.script("/fire", [.status(413, "<html>too big</html>")])
        await fails(.rejected(code: "HTTP_413")) { try await rig.client.fireNow("esc-1") }
        rig.transport.script("GET", [.status(502, "<html>bad gateway</html>")])
        await fails(.server(status: 502)) { _ = try await rig.client.status("esc-1") }
        rig.transport.script("GET", [.offline])
        await fails(.transport) { _ = try await rig.client.status("esc-1") }
        rig.transport.script("GET", [.status(401, "")])
        await fails(.unauthorized) { _ = try await rig.client.status("esc-1") }
        rig.transport.script("GET", [.status(404, "")])
        await fails(.notFound) { _ = try await rig.client.status("esc-1") }
    }

    func testAnUnreadableSuccessBodyIsAnInvalidResponse() async throws {
        let rig = try await Rig().started()
        rig.transport.script("/escalations", [.status(201, "<html>captive portal</html>")])
        await fails(.invalidResponse) { _ = try await rig.client.register(deadline: Date(), facts: Fixtures.facts()) }
        rig.transport.script("/escalations", [.status(201, #"{"ok":false,"data":null,"error":null}"#)])
        await fails(.invalidResponse) { _ = try await rig.client.register(deadline: Date(), facts: Fixtures.facts()) }
        rig.transport.script("GET", [.status(200, #"{"ok":true,"data":{"state":"pending"},"error":null}"#)])
        await fails(.invalidResponse) { _ = try await rig.client.status("esc-1") }
    }

    func testErrorsNeverCarryTheTokenOrAPhoneNumber() async throws {
        let rig = try await Rig().started()
        let replies: [StubTransport.Reply] = [.offline, .status(401, ""), .status(503, ""),
            .status(400, #"{"ok":false,"data":null,"error":{"code":"INVALID_REQUEST","message":"+15555550101"}}"#)]
        for reply in replies {
            rig.transport.script("GET", [reply])
            do { _ = try await rig.client.status("esc-1"); XCTFail("expected an error") }
            catch {
                let text = "\(error) \(error.localizedDescription) \(String(reflecting: error))"
                XCTAssertEqual(text.contains(StubTransport.token), false)
                XCTAssertEqual(text.contains("+1555"), false)
                XCTAssertEqual(text.contains("Alex"), false)
            }
        }
    }

    func testIdsThatCouldChangeTheRequestPathAreRefusedLocally() async throws {
        let rig = try await Rig().started()
        for bad in ["", "../sessions/sess-1", "esc 1", "esc-1/fire", "esc-1?x=1", "é"] {
            await fails(.rejected(code: "INVALID_ID")) { _ = try await rig.client.status(bad) }
        }
        XCTAssertEqual(rig.transport.calls.count, 1)       // only the session start
    }

    func testFactsThatCannotBeEncodedNeverReachTheNetwork() async throws {
        let rig = try await Rig().started()
        let nan = GeoPoint(lat: .nan, lon: 0, accuracyM: 5, at: Date())
        await fails(.rejected(code: "UNENCODABLE")) {
            _ = try await rig.client.register(deadline: Date(), facts: Fixtures.facts(location: nan))
        }
        XCTAssertEqual(rig.transport.calls.count, 1)
    }
}
