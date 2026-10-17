#if SESSION_CORE_STANDALONE
import Foundation
#else
import XCTest
@testable import RaveGuardSession
#endif

final class CheckInLadderTests: XCTestCase {
    final class Clock {
        var now = Date(timeIntervalSince1970: 0)
        var elapsed: TimeInterval = 0
        func advance(to seconds: Double) {
            now = Date(timeIntervalSince1970: seconds)
            elapsed = seconds
        }
    }
    func make(_ mode: CheckInLadder.Mode = .demo) -> (CheckInLadder, Clock) {
        let clock = Clock()
        return (CheckInLadder(mode: mode, clock: { clock.now }, elapsedClock: { clock.elapsed }), clock)
    }
    func testStartRegistersDemoDeadlineOnceAndPrompts() {
        let (ladder, _) = make()
        XCTAssertEqual(ladder.start(), [.register(checkInID: ladder.id, deadline: Date(timeIntervalSince1970: 35)), .prompt(.whisper)])
        XCTAssertEqual(ladder.phase, .prompting(.whisper, until: Date(timeIntervalSince1970: 10)))
        XCTAssertEqual(ladder.start(), [])
    }
    func testRealDeadlineAndBoundariesUseRealDurations() {
        let (ladder, clock) = make(.real)
        XCTAssertEqual(ladder.start().first, .register(checkInID: ladder.id, deadline: Date(timeIntervalSince1970: 70)))
        clock.advance(to: 20)
        XCTAssertEqual(ladder.tick(), [.prompt(.loud)])
        XCTAssertEqual(ladder.phase, .prompting(.loud, until: Date(timeIntervalSince1970: 40)))
        clock.advance(to: 40)
        XCTAssertEqual(ladder.tick(), [.stopPrompts])
        XCTAssertEqual(ladder.phase, .prompting(.pinGate, until: Date(timeIntervalSince1970: 70)))
    }
    func testDemoStagesAdvanceAtBoundariesWithoutRepeatingPrompts() {
        let (ladder, clock) = make(); _ = ladder.start()
        clock.advance(to: 9.99); XCTAssertEqual(ladder.tick(), [])
        clock.advance(to: 10); XCTAssertEqual(ladder.tick(), [.prompt(.loud)])
        XCTAssertEqual(ladder.tick(), [])
        clock.advance(to: 20); XCTAssertEqual(ladder.tick(), [.stopPrompts])
        XCTAssertEqual(ladder.phase, .prompting(.pinGate, until: Date(timeIntervalSince1970: 35)))
    }
    func testDelayedTickSkipsExpiredPromptsAndWaitsForServer() {
        let (ladder, clock) = make(); _ = ladder.start()
        clock.advance(to: 100)
        XCTAssertEqual(ladder.tick(), [.stopPrompts, .fetchStatus(checkInID: ladder.id)])
        XCTAssertEqual(ladder.phase, .awaitingServer)
        XCTAssertEqual(ladder.tick(), [])
        XCTAssertEqual(ladder.receive(.notifying), [])
        XCTAssertEqual(ladder.phase, .escalated)
    }
    func testNodCancelsWhisperAndCannotRestartLadder() {
        let (ladder, clock) = make(); _ = ladder.start()
        XCTAssertEqual(ladder.nod(), [.stopPrompts, .cancel(checkInID: ladder.id, mode: .safe)])
        XCTAssertEqual(ladder.phase, .cancelled)
        clock.advance(to: 100)
        XCTAssertEqual(ladder.tick(), []); XCTAssertEqual(ladder.start(), [])
        XCTAssertEqual(ladder.nod(), [])
    }
    func testTapCancelsLoudPrompt() {
        let (ladder, clock) = make(); _ = ladder.start()
        clock.advance(to: 11); _ = ladder.tick()
        XCTAssertEqual(ladder.tapCancel(), [.stopPrompts, .cancel(checkInID: ladder.id, mode: .safe)])
    }
    func testNodAndTapCannotBypassPINGateEvenWithoutATick() {
        let (ladder, clock) = make(); _ = ladder.start()
        clock.advance(to: 20)
        XCTAssertFalse(ladder.nod().contains(.cancel(checkInID: ladder.id, mode: .safe)))
        XCTAssertEqual(ladder.phase, .prompting(.pinGate, until: Date(timeIntervalSince1970: 35)))
        XCTAssertEqual(ladder.tapCancel(), [])
    }
    func testPINIsIgnoredBeforeGate() {
        let (ladder, _) = make(); _ = ladder.start()
        XCTAssertEqual(ladder.submitPIN(.safe), [])
        XCTAssertEqual(ladder.submitPIN(.duress), [])
    }
    func testSafeAndDuressHaveIdenticalVisiblePhaseButDifferentActions() {
        for pin in [CheckInLadder.PIN.safe, .duress] {
            let (ladder, clock) = make(); _ = ladder.start()
            clock.advance(to: 20); _ = ladder.tick()
            let expected: CheckInLadder.CancelMode = pin == .safe ? .safe : .duress
            XCTAssertEqual(ladder.submitPIN(pin), [.stopPrompts, .cancel(checkInID: ladder.id, mode: expected)])
            XCTAssertEqual(ladder.phase, .cancelled)
            _ = ladder.receive(.notifying, sosOpen: true)
            XCTAssertEqual(ladder.phase, .cancelled)
            _ = ladder.receive(.resolved)
            XCTAssertEqual(ladder.phase, .cancelled)
        }
    }
    func testThirdWrongPINFiresOnceAndAwaitsServer() {
        let (ladder, clock) = make(); _ = ladder.start()
        clock.advance(to: 20); _ = ladder.tick()
        XCTAssertEqual(ladder.submitPIN(.wrong), [])
        XCTAssertEqual(ladder.submitPIN(.wrong), [])
        XCTAssertEqual(ladder.submitPIN(.wrong), [.stopPrompts, .fireNow(checkInID: ladder.id)])
        XCTAssertEqual(ladder.phase, .awaitingServer)
        XCTAssertEqual(ladder.submitPIN(.wrong), [])
    }
    func testPINAfterDeadlineCannotCancelTimedOutLadder() {
        let (ladder, clock) = make(); _ = ladder.start()
        clock.advance(to: 35)
        XCTAssertEqual(ladder.submitPIN(.safe), [.stopPrompts, .fetchStatus(checkInID: ladder.id)])
        XCTAssertEqual(ladder.phase, .awaitingServer)
    }
    func testServerAcknowledgmentAndResolutionDoNotRegressOnStalePending() {
        let (ladder, _) = make(); _ = ladder.start()
        XCTAssertEqual(ladder.receive(.notifying), [.stopPrompts])
        XCTAssertEqual(ladder.phase, .escalated)
        _ = ladder.receive(.acknowledged)
        XCTAssertEqual(ladder.phase, .acknowledged)
        _ = ladder.receive(.pending); _ = ladder.receive(.notifying, sosOpen: true)
        XCTAssertEqual(ladder.phase, .acknowledged)
        _ = ladder.receive(.resolved)
        XCTAssertEqual(ladder.phase, .resolved)
        _ = ladder.receive(.notifying, sosOpen: true)
        XCTAssertEqual(ladder.phase, .resolved)
    }
    func testSOSOnlyAppearsOnServerInstruction() {
        let (ladder, clock) = make(); _ = ladder.start()
        clock.advance(to: 95); _ = ladder.tick()
        XCTAssertEqual(ladder.phase, .awaitingServer)
        _ = ladder.receive(.notifying, sosOpen: true)
        XCTAssertEqual(ladder.phase, .sos)
    }
    func testEventsBeforeStartDoNothing() {
        let (ladder, _) = make()
        XCTAssertEqual(ladder.tick(), []); XCTAssertEqual(ladder.tapCancel(), [])
        XCTAssertEqual(ladder.submitPIN(.safe), []); XCTAssertEqual(ladder.receive(.notifying), [])
        XCTAssertEqual(ladder.phase, .idle)
    }
    func testWallClockRollbackCannotExtendTheCheckIn() {
        let (ladder, clock) = make(); _ = ladder.start()
        clock.advance(to: 5); _ = ladder.tick()
        clock.now = Date(timeIntervalSince1970: -55)
        XCTAssertEqual(ladder.secondsRemaining, 5)
        clock.elapsed = 10
        XCTAssertEqual(ladder.tick(), [.prompt(.loud)])
        clock.elapsed = 35
        XCTAssertEqual(ladder.tick(), [.stopPrompts, .fetchStatus(checkInID: ladder.id)])
        XCTAssertEqual(ladder.phase, .awaitingServer)
        XCTAssertEqual(ladder.secondsRemaining, nil)
    }
    func testWallClockForwardJumpCannotSkipThePINGate() {
        let (ladder, clock) = make(); _ = ladder.start()
        clock.elapsed = 5
        clock.now = Date(timeIntervalSince1970: 3600)
        XCTAssertEqual(ladder.tick(), [])
        XCTAssertEqual(ladder.secondsRemaining, 5)
        clock.elapsed = 20
        XCTAssertEqual(ladder.tick(), [.stopPrompts])
        XCTAssertEqual(ladder.secondsRemaining, 15)
        XCTAssertEqual(ladder.submitPIN(.safe), [.stopPrompts, .cancel(checkInID: ladder.id, mode: .safe)])
    }

}
