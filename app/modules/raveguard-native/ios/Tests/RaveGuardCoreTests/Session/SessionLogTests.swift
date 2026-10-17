import Foundation
import Testing
@testable import RaveGuardCore

private func tempLogURL() -> URL {
    FileManager.default.temporaryDirectory
        .appendingPathComponent("rg-log-\(UUID().uuidString)/RaveGuard/session-log.jsonl")
}

private func event(_ kind: SessionEventKind, _ detail: String? = nil, at seconds: Double) -> SessionEvent {
    SessionEvent(id: UUID(), at: Date(timeIntervalSince1970: 1_800_000_000 + seconds), kind: kind, detail: detail)
}

/// A11: append-only JSON on the device, surviving relaunches.
@Suite struct SessionLogTests {

    @Test func survivesARelaunch() throws {
        let url = tempLogURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent().deletingLastPathComponent()) }
        let first = SessionLog(fileURL: url)
        let written = [event(.sessionStarted, "demo", at: 0), event(.trigger, "fall: spike 3.1 g", at: 5.25),
                       event(.pinDuress, at: 40)]
        written.forEach(first.append)

        let relaunched = SessionLog(fileURL: url)
        #expect(relaunched.events.map(\.id) == written.map(\.id))
        #expect(relaunched.events.map(\.kind) == [.sessionStarted, .trigger, .pinDuress])
        #expect(relaunched.events[1].detail == "fall: spike 3.1 g")
        #expect(abs(relaunched.events[1].at.timeIntervalSince(written[1].at)) < 0.001)   // ms kept
    }

    @Test func isOneJSONObjectPerLineAndOnlyGrows() throws {
        let url = tempLogURL()
        let log = SessionLog(fileURL: url)
        log.append(event(.sessionStarted, at: 0))
        let before = try Data(contentsOf: url)
        log.append(event(.checkInStarted, "fall", at: 1))
        let after = try Data(contentsOf: url)
        #expect(after.starts(with: before))   // appended, never rewritten
        let lines = String(decoding: after, as: UTF8.self).split(separator: "\n")
        #expect(lines.count == 2)
        for line in lines {
            let object = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any]
            #expect(object?["kind"] != nil && object?["at"] != nil && object?["id"] != nil)
        }
    }

    @Test func skipsAHalfWrittenLastLineAfterACrash() throws {
        let url = tempLogURL()
        let log = SessionLog(fileURL: url)
        log.append(event(.sessionStarted, at: 0))
        log.append(event(.nod, at: 2))
        let handle = try FileHandle(forWritingTo: url)
        try handle.seekToEnd()
        try handle.write(contentsOf: Data(#"{"at":"2027-01-15T08:00:03.000Z","de"#.utf8))
        try handle.close()

        let relaunched = SessionLog(fileURL: url)
        #expect(relaunched.events.map(\.kind) == [.sessionStarted, .nod])
        relaunched.append(event(.tapCancel, at: 4))   // keeps working after the bad line
        #expect(SessionLog(fileURL: url).events.last?.kind == .tapCancel)
    }

    @Test func compactsToTheNewestEvents() throws {
        let url = tempLogURL()
        let log = SessionLog(fileURL: url, maxEvents: 100)
        for i in 0..<250 { log.append(event(.motionState, "dancing", at: Double(i))) }
        #expect(log.events.count <= 200)
        let relaunched = SessionLog(fileURL: url, maxEvents: 100)
        #expect(relaunched.events.count == 100)
        #expect(relaunched.events.last?.at == Date(timeIntervalSince1970: 1_800_000_000 + 249))
    }

    @Test func isExcludedFromBackup() throws {
        let url = tempLogURL()
        _ = SessionLog(fileURL: url)
        let values = try url.deletingLastPathComponent().resourceValues(forKeys: [.isExcludedFromBackupKey])
        #expect(values.isExcludedFromBackup == true)
    }

    @Test func clearDeletesEverything() {
        let url = tempLogURL()
        let log = SessionLog(fileURL: url)
        log.append(event(.pinDuress, at: 0))
        log.clear()
        #expect(log.events.isEmpty)
        #expect(SessionLog(fileURL: url).events.isEmpty)
    }

    @Test func standardLivesInApplicationSupport() throws {
        let log = try SessionLog.standard()
        #expect(log.fileURL.path.contains("Application Support/RaveGuard/session-log.jsonl"))
    }

    @Test func keepsWorkingInMemoryWhenTheFileCantBeWritten() {
        // A path under a regular file can never be created.
        let blocker = FileManager.default.temporaryDirectory.appendingPathComponent("rg-blocker-\(UUID())")
        FileManager.default.createFile(atPath: blocker.path, contents: Data())
        let log = SessionLog(fileURL: blocker.appendingPathComponent("x/session-log.jsonl"))
        log.append(event(.nod, at: 0))
        #expect(log.events.count == 1)
        #expect(log.lastError != nil)
    }
}

/// A12: a canned log produces the expected BriefFacts.
@Suite struct BriefFactsBuilderTests {

    let trigger = MotionEvent(kind: .fall, at: Date(timeIntervalSince1970: 1_800_000_000 + 600),
                              reason: "spike 3.1 g, head 70° sideways, still 10 s",
                              posture: Posture(pitchDeg: 5, rollDeg: 70))

    /// One night: an earlier session, then this one — dancing, a walk, dancing again,
    /// then still, a fall, and a check-in that reached the PIN gate.
    var cannedLog: [SessionEvent] {
        [
            event(.sessionStarted, at: -9000), event(.motionState, "dancing", at: -8000),
            event(.sessionEnded, at: -7000),
            event(.sessionStarted, "demo", at: 0),
            event(.motionState, "dancing", at: 10),
            event(.motionState, "walking", at: 200),
            event(.motionState, "dancing", at: 300),
            event(.motionState, "still", at: 520),
            event(.trigger, "fall: spike 3.1 g, head 70° sideways, still 10 s", at: 600),
            event(.checkInStarted, "fall", at: 600),
            event(.promptEscalated, at: 620),
            event(.pinGateOpened, at: 640),
        ]
    }

    @Test func cannedLogProducesTheExpectedFacts() {
        let facts = BriefFactsBuilder.build(events: cannedLog, wearerName: "Alex",
                                            selfDescription: "black hoodie, white cap", trigger: trigger)
        #expect(facts == BriefFacts(
            wearerName: "Alex", selfDescription: "black hoodie, white cap",
            lastActiveState: .dancing,
            lastActiveUntil: Date(timeIntervalSince1970: 1_800_000_000 + 520),   // dancing until still
            trigger: trigger, promptsUnanswered: 2, location: nil))
    }

    @Test func stillActiveAtTheTriggerMeansUntilTheTrigger() {
        let log = Array(cannedLog.prefix(7)) + [event(.checkInStarted, "fall", at: 600)]
        let facts = BriefFactsBuilder.build(events: log, wearerName: "Alex", selfDescription: "", trigger: trigger)
        #expect(facts.lastActiveState == .dancing)
        #expect(facts.lastActiveUntil == trigger.at)
        #expect(facts.promptsUnanswered == 0)
    }

    @Test func nothingActiveThisSessionIsUnknown() {
        // The earlier session's dancing doesn't count.
        let log = Array(cannedLog.prefix(4)) + [event(.motionState, "still", at: 50)]
        let facts = BriefFactsBuilder.build(events: log, wearerName: "Alex", selfDescription: "", trigger: trigger)
        #expect(facts.lastActiveState == .unknown)
        #expect(facts.lastActiveUntil == nil)
    }

    @Test func promptsCountOnlyTheCurrentCheckIn() {
        let log = cannedLog + [event(.tapCancel, at: 650),
                               event(.checkInStarted, "manual", at: 900), event(.promptEscalated, at: 920)]
        #expect(BriefFactsBuilder.promptsUnanswered(in: log[...]) == 1)
    }

    @Test func motionUnavailableNoteDoesNotStartANewSession() {
        let log = [event(.sessionStarted, at: 0), event(.motionState, "dancing", at: 1),
                   event(.sessionStarted, "motion unavailable: denied", at: 1.5)]
        let facts = BriefFactsBuilder.build(events: log, wearerName: "A", selfDescription: "", trigger: trigger)
        #expect(facts.lastActiveState == .dancing)
    }

    @Test func passesTheLocationThrough() {
        let fix = GeoPoint(lat: 43.66, lon: -79.39, accuracyM: 30, at: trigger.at)
        let facts = BriefFactsBuilder.build(events: cannedLog, wearerName: "A", selfDescription: "",
                                            trigger: trigger, location: fix)
        #expect(facts.location == fix)
    }

    /// BRF-1 / PRV-1: what leaves the phone is the brief's fields, never log events.
    @Test func encodedFactsCarryNoLogEvents() throws {
        let facts = BriefFactsBuilder.build(events: cannedLog + [event(.pinDuress, at: 645)],
                                            wearerName: "Alex", selfDescription: "", trigger: trigger)
        let json = String(decoding: try JSONEncoder().encode(facts), as: UTF8.self)
        let object = try JSONSerialization.jsonObject(with: Data(json.utf8)) as! [String: Any]
        #expect(Set(object.keys) == ["wearerName", "selfDescription", "lastActiveState", "lastActiveUntil",
                                     "trigger", "promptsUnanswered"])
        #expect(!json.contains("pinDuress"))
        #expect(!json.contains("motionState"))
    }
}

/// The session writes what the brief needs, and the brief is built from it.
@MainActor
@Suite struct SessionLogWiringTests {

    @Test func motionStateChangesAreLoggedOncePerChange() async {
        let h = SessionHarness()
        h.session.handleMotionState(.dancing)   // idle: not logged
        h.session.start()
        await h.settle()
        for s in [MotionState.dancing, .dancing, .walking, .walking, .still] { h.session.handleMotionState(s) }
        let logged = h.log.events.filter { $0.kind == .motionState }.compactMap(\.detail)
        #expect(logged == ["dancing", "walking", "still"])
    }

    @Test func registeredFactsComeFromTheLog() async throws {
        let h = SessionHarness()
        h.session.start()
        await h.settle()
        h.session.handleMotionState(.dancing)
        await h.advance(120)
        h.session.handleMotionState(.still)
        let stoppedDancing = h.clock.now
        await h.advance(30)
        h.session.handleTrigger(MotionEvent(kind: .fall, at: h.clock.now, reason: "x", posture: nil))
        await h.settle()
        let registered = try #require(h.server.escalations["esc1"]?.facts)
        #expect(registered.lastActiveState == .dancing)
        #expect(registered.lastActiveUntil == stoppedDancing)
        #expect(registered.promptsUnanswered == 0)
        await h.advance(40)   // through loud, into the PIN gate
        #expect(h.server.escalations["esc1"]?.updates.map(\.promptsUnanswered) == [1, 2])
    }

    @Test func aFileLogSurvivesASessionAndARelaunch() async throws {
        let url = tempLogURL()
        let clock = ManualSessionClock()
        let server = ScriptedEscalationService(clock: clock, ackWindow: 20)
        let session = SessionManager(config: SessionManagerConfig(wearerName: "Alex", demo: true),
                                     clock: clock, escalation: server, log: SessionLog(fileURL: url))
        session.start()
        await session.settle()
        session.handleTrigger(MotionEvent(kind: .fall, at: clock.now, reason: "x", posture: nil))
        await session.settle()
        session.pinResult(.duress)
        await session.settle()
        let kinds = SessionLog(fileURL: url).events.map(\.kind)
        #expect(kinds == [.sessionStarted, .trigger, .checkInStarted, .pinDuress])
    }
}
