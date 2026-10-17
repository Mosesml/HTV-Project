import Foundation
import Testing
@testable import RaveGuardCore

/// J9: the check-in scheduler and trigger intake from a MotionEventSource.
@MainActor
@Suite struct SessionSchedulerTests {

    @Test func scheduledCheckInFiresAtTheInterval() async {
        let h = SessionHarness(intervalMin: 30)
        h.session.start()
        await h.settle()
        #expect(h.session.nextCheckIn == h.clock.now.addingTimeInterval(1800))
        await h.advance(1799)
        #expect(h.session.phase == .monitoring)
        await h.advance(1)
        #expect(h.stage == .whisper)
        #expect(h.session.nextCheckIn == nil)
        #expect(h.log.events.contains { $0.kind == .trigger && $0.detail?.hasPrefix("scheduled") == true })
    }

    @Test func cancelReschedulesFromNow() async {
        let h = SessionHarness(intervalMin: 60)
        h.session.start()
        await h.advance(600)
        h.session.handleTrigger(MotionEvent(kind: .fall, at: h.clock.now, reason: "x", posture: nil))
        await h.settle()
        h.session.tapCancel()
        #expect(h.session.nextCheckIn == h.clock.now.addingTimeInterval(3600))
        await h.advance(3599)
        #expect(h.session.phase == .monitoring)
        await h.advance(1)
        #expect(h.stage == .whisper)
    }

    @Test func demoModeHasNoScheduledCheckIns() async {
        let h = SessionHarness(demo: true)
        h.session.start()
        await h.advance(7200)
        #expect(h.session.phase == .monitoring)
        #expect(h.session.nextCheckIn == nil)
    }

    @Test func fakeMotionTriggerStartsACheckIn() async {
        let h = SessionHarness(attachMotion: true)
        h.session.start()
        await h.settle()
        #expect(h.motion.isRunning)
        await waitUntil { h.motion.triggerSubscriberCount > 0 }
        h.motion.fireTrigger(.fall, at: h.clock.now)
        await waitUntil { h.stage != nil }
        #expect(h.stage == .whisper)
        #expect(h.motion.isListeningForNod)
    }

    @Test func fakeNodCancelsOnlyWhileListening() async {
        let h = SessionHarness(attachMotion: true)
        h.session.start()
        await h.settle()
        #expect(h.motion.fireNod() == false)   // not listening while monitoring
        h.session.handleTrigger(MotionEvent(kind: .manual, at: h.clock.now, reason: "x", posture: nil))
        await h.settle()
        #expect(h.motion.fireNod())
        await waitUntil { h.session.phase == .monitoring }
        #expect(h.session.phase == .monitoring)
        #expect(h.log.kinds.contains(.nod))
    }

    @Test func airPodsDisconnectIsLogged() async {
        let h = SessionHarness(attachMotion: true)
        h.session.start()
        await h.settle()
        h.motion.setConnected(false)
        await waitUntil { h.log.kinds.contains(.airPodsDisconnected) }
        #expect(h.log.kinds.contains(.airPodsDisconnected))
        #expect(h.session.phase == .monitoring)
    }

    @Test func lastActiveStateFeedsTheBrief() async {
        let h = SessionHarness(attachMotion: true)
        h.session.start()
        await h.settle()
        h.motion.setState(.dancing)
        await waitUntil { h.log.events.isEmpty == false }
        for _ in 0..<20 { await Task.yield() }
        h.session.handleTrigger(MotionEvent(kind: .fall, at: h.clock.now, reason: "x", posture: nil))
        await h.settle()
        #expect(h.server.escalations["esc1"]?.facts.lastActiveState == .dancing)
        #expect(h.server.escalations["esc1"]?.facts.wearerName == "Alex")
    }
}

/// J10: escalation wiring, including the network failing at awkward moments.
@MainActor
@Suite struct SessionEscalationWiringTests {

    @Test func nodBeforeRegisterLandsStillCancels() async {
        let h = SessionHarness()
        h.session.start()
        await h.settle()
        h.session.handleTrigger(MotionEvent(kind: .fall, at: h.clock.now, reason: "x", posture: nil))
        h.session.handleNod(at: h.clock.now)   // register still in flight
        await h.settle()
        #expect(h.session.phase == .monitoring)
        #expect(h.server.calls.suffix(2) == ["register(esc1)", "cancel(esc1, safe)"])
    }

    @Test func duressBeforeRegisterLandsStillFires() async {
        let h = SessionHarness()
        h.session.start()
        await h.settle()
        h.session.handleTrigger(MotionEvent(kind: .fall, at: h.clock.now, reason: "x", posture: nil))
        h.session.pinResult(.duress)
        await h.settle()
        #expect(h.session.phase == .monitoring)
        #expect(h.server.calls.suffix(2) == ["register(esc1)", "cancel(esc1, duress)"])
    }

    @Test func registerIsRetriedWithTheOriginalDeadline() async {
        let h = SessionHarness()
        h.session.start()
        await h.settle()
        let t0 = h.clock.now
        h.server.offline = true
        h.session.handleTrigger(MotionEvent(kind: .fall, at: h.clock.now, reason: "x", posture: nil))
        await h.advance(9)
        #expect(h.server.order.isEmpty)
        h.server.offline = false
        await h.advance(2)
        #expect(h.server.order == ["esc1"])
        #expect(h.server.escalations["esc1"]?.deadline == t0.addingTimeInterval(70))
    }

    @Test func cancelIsRetriedUntilItLands() async {
        let h = SessionHarness()
        await h.startCheckIn()
        h.server.offline = true
        h.session.tapCancel()
        await h.advance(10)
        #expect(h.session.phase == .monitoring)  // the wearer isn't kept waiting
        #expect(!h.server.calls.contains("cancel(esc1, safe)"))
        h.server.offline = false
        await h.advance(2)
        #expect(h.server.calls.filter { $0 == "cancel(esc1, safe)" }.count == 1)
    }

    @Test func fireNowIsRetriedUntilItLands() async {
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(45)
        h.server.offline = true
        for _ in 0..<3 { h.session.pinResult(.wrong) }
        await h.advance(5)
        #expect(h.session.phase == .escalated(escalationId: "esc1"))
        h.server.offline = false
        await h.advance(2)
        #expect(h.server.calls.filter { $0 == "fireNow(esc1)" }.count == 1)
    }

    @Test func serverSessionStartIsRetriedBeforeAnyRegister() async {
        let h = SessionHarness()
        h.server.offline = true
        h.session.start()
        h.session.handleTrigger(MotionEvent(kind: .fall, at: h.clock.now, reason: "x", posture: nil))
        await h.advance(5)
        h.server.offline = false
        await h.advance(2)
        #expect(h.server.calls.prefix(2) == ["startSession(demo: false)", "register(esc1)"])
    }

    @Test func heartbeatEveryTenSeconds() async {
        let h = SessionHarness()
        h.session.start()
        await h.advance(60)
        #expect(h.server.calls.filter { $0 == "heartbeat" }.count == 6)
    }

    @Test func fullLadderAgainstTheScriptedServer() async {
        // Scenario 2 + 5 at real timings: fall, no answer, chain, SOS.
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(70)
        #expect(h.session.phase == .escalated(escalationId: "esc1"))
        await h.advance(360 + 3)
        #expect(h.session.phase == .sos)
        let notified = h.statuses.last?.recipients.map(\.name)
        #expect(notified == ["Contact 1", "Contact 2", "Venue staff"])
    }
}

/// J11: demo timings and DEM-1.
@MainActor
@Suite struct SessionDemoTests {

    @Test func timingsMatchThePRDTable() {
        #expect(SessionTimings.real.deadline == 70)
        #expect(SessionTimings.real.sosAfter == 430)  // 7 min 10 s
        #expect(SessionTimings.demo.deadline == 35)
        #expect(SessionTimings.demo.sosAfter == 95)
    }

    @Test func demoLadderReachesSOSInAbout95Seconds() async {
        let h = SessionHarness(demo: true)
        h.session.debugFire(5)
        await h.settle()
        #expect(h.stage == .whisper)
        await h.advance(10); #expect(h.stage == .loud)
        await h.advance(10); #expect(h.stage == .pinGate)
        await h.advance(15); #expect(h.session.phase == .escalated(escalationId: "esc1"))
        await h.advance(57)
        #expect(h.session.phase != .sos)
        await h.advance(6)   // next poll after 95 s
        #expect(h.session.phase == .sos)
        #expect(h.server.calls.first == "startSession(demo: true)")
    }

    @Test func scenario4GoesOfflineAfterRegisterAndServerStillFires() async {
        let h = SessionHarness(demo: true)
        h.session.debugFire(4)
        await h.settle()
        #expect(h.server.order == ["esc1"])
        #expect(h.session.simulatedOffline)
        let callsBefore = h.server.calls.count
        await h.advance(40)
        #expect(h.session.phase == .escalated(escalationId: "esc1"))
        #expect(h.server.calls.count == callsBefore)   // phone silent
        h.session.setSimulatedOffline(false)
        await h.advance(4)
        #expect(h.statuses.last?.recipients.first?.name == "Contact 1")
    }

    @Test(arguments: 1...7)
    func everyDebugScenarioStartsACheckIn(_ n: Int) async {
        let h = SessionHarness(demo: true)
        h.session.debugFire(n)
        await h.settle()
        #expect(h.stage == .whisper)
        #expect(h.server.order == ["esc1"])
    }

    @Test func sosDialsOnlyTheTeammateAndOnlyInDemo() {
        var c = SessionManagerConfig(demo: true, teammatePhone: "+15555550123")
        #expect(c.sosDialNumber == "+15555550123")
        c.demo = false
        #expect(c.sosDialNumber == nil)
    }

    /// DEM-1: no code path dials an emergency number. Scans every Swift source in the
    /// native module (not just Justin's folders), so anyone adding one gets a red build.
    @Test func noEmergencyNumberAnywhereInTheNativeCode() throws {
        let iosRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let files = FileManager.default.enumerator(at: iosRoot, includingPropertiesForKeys: nil)!
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" && !$0.path.contains("/.build/")
                      && !$0.path.hasSuffix("SessionWiringTests.swift") }
        #expect(files.count > 5)
        let pattern = try NSRegularExpression(
            pattern: #"(?<![0-9_.])(911|112|999|000)(?![0-9_.])"#)
        var hits: [String] = []
        for file in files {
            let text = try String(contentsOf: file, encoding: .utf8)
            for (i, line) in text.split(separator: "\n", omittingEmptySubsequences: false).enumerated()
            where pattern.firstMatch(in: String(line), range: NSRange(line.startIndex..., in: line)) != nil {
                hits.append("\(file.lastPathComponent):\(i + 1): \(line)")
            }
        }
        #expect(hits.isEmpty, "\(hits.joined(separator: "\n"))")
    }
}

/// Lets stream-consuming tasks run until `condition` holds (or gives up).
@MainActor
func waitUntil(_ condition: () -> Bool) async {
    for _ in 0..<2000 where !condition() {
        await Task.yield()
        try? await Task.sleep(nanoseconds: 100_000)
    }
}
