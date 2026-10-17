import Foundation
import Testing
@testable import RaveGuardCore

/// J8: one test per SessionPhase transition, against an injected clock.
@MainActor
@Suite struct SessionManagerTransitionTests {

    @Test func startGoesToMonitoringAndOpensServerSession() async {
        let h = SessionHarness()
        h.session.start()
        await h.settle()
        #expect(h.session.phase == .monitoring)
        #expect(h.server.calls == ["startSession(demo: false)"])
        #expect(h.log.kinds == [.sessionStarted])
    }

    @Test func sessionNeverStartsOnItsOwn() async {
        let h = SessionHarness()
        h.session.handleTrigger(MotionEvent(kind: .fall, at: h.clock.now, reason: "x", posture: nil))
        await h.advance(3600)
        #expect(h.session.phase == .idle)
        #expect(h.server.calls.isEmpty)
    }

    @Test func triggerStartsWhisperAndRegistersDeadline() async {
        let h = SessionHarness()
        let t0 = h.clock.now
        await h.startCheckIn()
        #expect(h.session.phase == .checkIn(.whisper, stageEndsAt: t0.addingTimeInterval(20)))
        #expect(h.server.calls.contains("register(esc1)"))
        #expect(h.server.escalations["esc1"]?.deadline == t0.addingTimeInterval(70))
        #expect(h.prompter.calls == ["whisper"])
        #expect(h.log.kinds.suffix(2) == [.trigger, .checkInStarted])
    }

    @Test func whisperTimesOutToLoud() async {
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(20)
        #expect(h.stage == .loud)
        #expect(h.prompter.calls == ["whisper", "loud"])
        #expect(h.server.escalations["esc1"]?.updates.last?.promptsUnanswered == 1)
        #expect(h.log.kinds.contains(.promptEscalated))
    }

    @Test func loudTimesOutToPinGateAndStopsListening() async {
        let h = SessionHarness(attachMotion: true)
        await h.startCheckIn()
        #expect(h.motion.isListeningForNod)
        await h.advance(40)
        #expect(h.stage == .pinGate)
        #expect(!h.motion.isListeningForNod)
        #expect(h.server.escalations["esc1"]?.updates.last?.promptsUnanswered == 2)
        #expect(h.log.kinds.contains(.pinGateOpened))
    }

    @Test(arguments: [0.0, 25.0])  // during whisper, during loud
    func nodCancelsSafely(after seconds: Double) async {
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(seconds)
        h.session.handleNod(at: h.clock.now)
        #expect(h.session.phase == .monitoring)
        #expect(h.prompter.calls.last == "stop")
        await h.settle()
        #expect(h.server.calls.contains("cancel(esc1, safe)"))
        #expect(h.log.kinds.contains(.nod))
    }

    @Test(arguments: [5.0, 30.0])
    func tapCancelsSafely(after seconds: Double) async {
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(seconds)
        h.session.tapCancel()
        await h.settle()
        #expect(h.session.phase == .monitoring)
        #expect(h.server.calls.contains("cancel(esc1, safe)"))
        #expect(h.log.kinds.contains(.tapCancel))
    }

    @Test func nodAndTapDoNothingAtPinGate() async {
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(45)
        h.session.handleNod(at: h.clock.now)
        h.session.tapCancel()
        await h.settle()
        #expect(h.stage == .pinGate)
        #expect(!h.server.calls.contains { $0.hasPrefix("cancel") })
    }

    @Test func safePinCancels() async {
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(45)
        h.session.pinResult(.safe)
        await h.settle()
        #expect(h.session.phase == .monitoring)
        #expect(h.server.calls.contains("cancel(esc1, safe)"))
        #expect(h.log.kinds.contains(.pinSafe))
    }

    @Test func duressPinLooksLikeSafeButFiresSilently() async {
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(45)
        h.session.pinResult(.duress)
        await h.settle()
        #expect(h.session.phase == .monitoring)
        #expect(h.server.calls.contains("cancel(esc1, duress)"))
        // The server works down the chain; the wearer's phone shows none of it.
        await h.advance(600)
        #expect(h.session.phase == .monitoring)
        #expect(h.statuses.isEmpty)
        #expect(h.server.calls.contains { $0 == "update(esc1)" })
        #expect(!h.log.kinds.contains(.escalated))
        #expect(h.log.kinds.contains(.pinDuress))
    }

    @Test func duressAndSafePinProduceIdenticalPhaseSequences() async {
        func run(_ pin: PINResult) async -> [SessionPhase] {
            let h = SessionHarness()
            await h.startCheckIn()
            await h.advance(45)
            h.session.pinResult(pin)
            await h.advance(600)
            return h.phases
        }
        let safe = await run(.safe)
        let duress = await run(.duress)
        #expect(safe == duress)
        #expect(safe.last == .monitoring)
    }

    @Test func threeWrongPinsFireImmediately() async {
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(45)
        h.session.pinResult(.wrong)
        h.session.pinResult(.wrong)
        #expect(h.stage == .pinGate)
        h.session.pinResult(.wrong)
        await h.settle()
        #expect(h.session.phase == .escalated(escalationId: "esc1"))
        #expect(h.server.calls.contains("fireNow(esc1)"))
        #expect(h.log.kinds.filter { $0 == .pinWrong }.count == 3)
    }

    @Test func twoWrongPinsThenSafeCancels() async {
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(45)
        h.session.pinResult(.wrong)
        h.session.pinResult(.wrong)
        h.session.pinResult(.safe)
        await h.settle()
        #expect(h.session.phase == .monitoring)
        #expect(!h.server.calls.contains("fireNow(esc1)"))
    }

    @Test func pinGateTimeoutEscalatesAtDeadline() async {
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(69)
        #expect(h.stage == .pinGate)
        await h.advance(1)
        #expect(h.session.phase == .escalated(escalationId: "esc1"))
        #expect(h.log.kinds.contains(.escalated))
        // Phone never fires on a timeout: the server owns the deadline.
        #expect(!h.server.calls.contains("fireNow(esc1)"))
    }

    @Test func escalatedPollsStatusThenOpensSOS() async {
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(70 + 3)
        #expect(h.statuses.last?.recipients.first?.name == "Contact 1")
        #expect(h.log.kinds.contains(.recipientNotified))
        // SOS opens 7 min 10 s after check-in start.
        await h.advance(430 - 73 - 4)
        #expect(h.session.phase == .escalated(escalationId: "esc1"))
        await h.advance(6)
        #expect(h.session.phase == .sos)
    }

    @Test func acknowledgementIsLoggedAndResolveReturnsToMonitoring() async {
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(75)
        h.server.acknowledge("esc1")
        await h.advance(3)
        #expect(h.statuses.last?.state == "acknowledged")
        #expect(h.log.kinds.contains(.recipientAcked))
        h.server.resolve("esc1")
        await h.advance(3)
        #expect(h.session.phase == .monitoring)
        #expect(h.log.kinds.last == .resolved)
        // No SOS later, and polling stopped.
        await h.advance(600)
        #expect(h.session.phase == .monitoring)
    }

    @Test func safePinAfterEscalationIsALateCancel() async {
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(80)
        h.session.pinResult(.safe)
        await h.settle()
        #expect(h.session.phase == .monitoring)
        #expect(h.server.calls.contains("cancel(esc1, safe)"))
    }

    @Test func sosResolvesBackToMonitoring() async {
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(440)
        #expect(h.session.phase == .sos)
        h.server.resolve("esc1")
        await h.advance(3)
        #expect(h.session.phase == .monitoring)
    }

    @Test func stopIsRefusedDuringACheckInOrEscalation() async {
        let h = SessionHarness()
        await h.startCheckIn()
        #expect(h.session.stop() == false)
        await h.advance(80)
        #expect(h.session.stop() == false)
        #expect(h.session.phase == .escalated(escalationId: "esc1"))
    }

    @Test func stopFromMonitoringEndsServerSession() async {
        let h = SessionHarness(attachMotion: true)
        h.session.start()
        await h.settle()
        #expect(h.session.stop())
        await h.settle()
        #expect(h.session.phase == .idle)
        #expect(h.server.calls.last == "endSession")
        #expect(!h.motion.isRunning)
        #expect(h.log.kinds.last == .sessionEnded)
        // Nothing keeps running.
        await h.advance(3600)
        #expect(!h.server.calls.dropFirst().contains("heartbeat"))
    }

    @Test func stopAfterDuressKeepsTheAlertAliveUntilResolved() async {
        let h = SessionHarness()
        await h.startCheckIn()
        await h.advance(45)
        h.session.pinResult(.duress)
        await h.settle()
        #expect(h.session.stop())
        await h.advance(30)
        #expect(h.session.phase == .idle)
        #expect(!h.server.calls.contains("endSession"))
        #expect(h.server.calls.filter { $0 == "heartbeat" }.count >= 3)
        h.server.resolve("esc1")
        await h.advance(4)
        #expect(h.server.calls.last == "endSession")
    }

    @Test func triggersDuringACheckInDontStartAnother() async {
        let h = SessionHarness()
        await h.startCheckIn()
        h.session.handleTrigger(MotionEvent(kind: .fall, at: h.clock.now, reason: "again", posture: nil))
        await h.settle()
        #expect(h.server.order == ["esc1"])
        #expect(h.log.kinds.filter { $0 == .trigger }.count == 2)
    }

    @Test func phasePayloadForTheModule() {
        let end = Date(timeIntervalSince1970: 100)
        let p = SessionPhase.checkIn(.loud, stageEndsAt: end).modulePayload
        #expect(p["phase"] as? String == "checkIn")
        #expect(p["stage"] as? String == "loud")
        #expect(p["stageEndsAt"] as? Double == 100_000)
        #expect(SessionPhase.escalated(escalationId: "e9").modulePayload["escalationId"] as? String == "e9")
    }
}
