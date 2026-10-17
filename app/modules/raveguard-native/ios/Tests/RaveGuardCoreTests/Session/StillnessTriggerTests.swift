import Foundation
import Testing
@testable import RaveGuardCore

/// BL3 (PRD A10 / DET-3): staying still too long starts a check-in. "Still" itself is the
/// classifier's, judged against the wearer's own baseline (BL4).
@MainActor
@Suite struct StillnessTriggerTests {

    private func stillnessTriggers(_ h: SessionHarness) -> [String] {
        h.log.events.filter { $0.kind == .trigger && $0.detail?.hasPrefix("stillness") == true }
            .compactMap(\.detail)
    }

    @Test func twoMinutesStillStartsACheckIn() async {
        let h = SessionHarness()
        h.session.start()
        h.session.handleMotionState(.still)
        await h.advance(119)
        #expect(h.session.phase == .monitoring)
        await h.advance(1)
        #expect(h.stage == .whisper)
        #expect(stillnessTriggers(h) == ["stillness: still for 2 min"])
    }

    /// A10's done-when in demo mode.
    @Test func thirtySecondsStillInDemoMode() async {
        let h = SessionHarness(demo: true)
        h.session.start()
        h.session.handleMotionState(.still)
        await h.advance(29)
        #expect(h.session.phase == .monitoring)
        await h.advance(1)
        #expect(h.stage == .whisper)
        #expect(stillnessTriggers(h) == ["stillness: still for 30 s"])
    }

    @Test func movingResetsTheCountdown() async {
        let h = SessionHarness()
        h.session.start()
        h.session.handleMotionState(.still)
        await h.advance(100)
        h.session.handleMotionState(.dancing)
        h.session.handleMotionState(.still)
        await h.advance(100)
        #expect(h.session.phase == .monitoring)
        await h.advance(20)
        #expect(h.stage == .whisper)
    }

    @Test func fallenNeverCountsAsStill() async {
        let h = SessionHarness()
        h.session.start()
        h.session.handleMotionState(.fallen)
        await h.advance(600)
        #expect(h.session.phase == .monitoring)
    }

    @Test func nothingWhileIdle() async {
        let h = SessionHarness()
        h.session.handleMotionState(.still)
        await h.advance(600)
        #expect(h.session.phase == .idle)
    }

    /// Sitting at the bar: one check-in, then none until they've moved again.
    @Test func afterAStillnessCheckInItWaitsForActivity() async {
        let h = SessionHarness()
        h.session.start()
        h.session.handleMotionState(.still)
        await h.advance(120)
        #expect(h.stage == .whisper)
        h.session.tapCancel()
        await h.advance(600)
        #expect(h.session.phase == .monitoring)
        #expect(stillnessTriggers(h).count == 1)

        h.session.handleMotionState(.walking)
        h.session.handleMotionState(.still)
        await h.advance(120)
        #expect(h.stage == .whisper)
        #expect(stillnessTriggers(h).count == 2)
    }

    /// Another check-in (a fall, a scheduled one) pauses the countdown; it starts over after.
    @Test func anotherCheckInStartsTheCountdownOver() async {
        let h = SessionHarness()
        h.session.start()
        h.session.handleMotionState(.still)
        await h.advance(90)
        h.session.handleTrigger(MotionEvent(kind: .manual, at: h.clock.now, reason: "x", posture: nil))
        await h.settle()
        await h.advance(10)   // still in the whisper stage, where Cancel works
        h.session.tapCancel()
        await h.advance(119)
        #expect(h.session.phase == .monitoring)
        await h.advance(1)
        #expect(h.stage == .whisper)
        #expect(stillnessTriggers(h).count == 1)
    }

    /// No data isn't stillness: AirPods out stops the countdown (review item 6).
    @Test func airPodsOutStopsTheCountdown() async {
        let h = SessionHarness()
        h.session.start()
        h.session.handleMotionState(.still)
        await h.advance(60)
        h.session.handleAirPodsConnected(false)
        await h.advance(300)
        #expect(h.session.phase == .monitoring)
        #expect(stillnessTriggers(h).isEmpty)
    }

    /// A stillness check-in that escalates and is resolved with the PIN comes back to
    /// monitoring, and waits for activity before counting again.
    @Test func afterAnEscalatedStillnessCheckInItWaitsForActivity() async {
        let h = SessionHarness()
        h.session.start()
        h.session.handleMotionState(.still)
        await h.advance(120)
        await h.advance(h.timings.deadline + 1)
        #expect(h.session.phase == .escalated(escalationId: "esc1"))
        h.session.pinResult(.safe)
        await h.settle()
        #expect(h.session.phase == .monitoring)
        await h.advance(300)
        #expect(h.session.phase == .monitoring)
        h.session.handleMotionState(.dancing)
        h.session.handleMotionState(.still)
        await h.advance(120)
        #expect(h.stage == .whisper)
    }

    @Test func stopForgetsTheState() async {
        let h = SessionHarness()
        h.session.start()
        h.session.handleMotionState(.still)
        await h.advance(60)
        #expect(h.session.stop())
        h.session.start()
        await h.advance(300)
        #expect(h.session.phase == .monitoring)
    }

    /// Through the motion source's `states` stream, as `HeadMotionStream` will send it.
    @Test func stillStateFromTheMotionSourceTriggers() async {
        let h = SessionHarness(demo: true, attachMotion: true)
        h.session.start()
        await h.settle()
        h.motion.setState(.still)
        await waitUntil { h.session.stillnessCountdownRunning }
        await h.advance(30)
        #expect(h.stage == .whisper)
    }
}
