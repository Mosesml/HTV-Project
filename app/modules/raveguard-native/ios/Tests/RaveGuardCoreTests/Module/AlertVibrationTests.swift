import Foundation
import Testing
@testable import RaveGuardCore

/// Records when each buzz happened, in seconds since `start`.
@MainActor
final class RecordingVibrator: Vibrating {
    let clock: ManualSessionClock
    let start: Date
    private(set) var times: [TimeInterval] = []
    init(clock: ManualSessionClock) { self.clock = clock; start = clock.now }
    func buzz() { times.append((clock.now.timeIntervalSince(start) * 100).rounded() / 100) }
    func since(_ t: TimeInterval) -> [TimeInterval] { times.filter { $0 >= t } }
}

@MainActor
@Suite struct AlertVibrationTests {
    let ends = Date(timeIntervalSince1970: 0)

    @Test func eachAlertScreenHasItsRhythmAndQuietScreensHaveNone() {
        #expect(VibrationPattern.forPhase(.checkIn(.whisper, stageEndsAt: ends)) == .whisper)
        #expect(VibrationPattern.forPhase(.checkIn(.loud, stageEndsAt: ends)) == .loud)
        #expect(VibrationPattern.forPhase(.checkIn(.pinGate, stageEndsAt: ends)) == .pinGate)
        #expect(VibrationPattern.forPhase(.escalated(escalationId: "e")) == .alert)
        #expect(VibrationPattern.forPhase(.sos) == .sos)
        #expect(VibrationPattern.forPhase(.monitoring) == nil)
        #expect(VibrationPattern.forPhase(.idle) == nil)
    }

    @Test func whisperIsALongBuzzEveryTwoSeconds() {
        let clock = ManualSessionClock(), v = RecordingVibrator(clock: clock)
        let alert = AlertVibration(clock: clock, vibrator: v)
        alert.follow(.checkIn(.whisper, stageEndsAt: ends))
        clock.advance(by: 4.1)
        #expect(v.times == [0, 0.45, 2, 2.45, 4])
    }

    @Test func loudIsADoubleBuzzAndPINGateIsContinuous() {
        let clock = ManualSessionClock(), v = RecordingVibrator(clock: clock)
        let alert = AlertVibration(clock: clock, vibrator: v)
        alert.follow(.checkIn(.loud, stageEndsAt: ends))
        clock.advance(by: 3.1)
        #expect(v.times == [0, 0.55, 1.5, 2.05, 3])
        alert.follow(.checkIn(.pinGate, stageEndsAt: ends))
        clock.advance(by: 2)
        #expect(v.since(3.1) == [3.1, 3.6, 4.1, 4.6, 5.1])
    }

    @Test func answeringStopsItAtOnce() {
        let clock = ManualSessionClock(), v = RecordingVibrator(clock: clock)
        let alert = AlertVibration(clock: clock, vibrator: v)
        alert.follow(.checkIn(.whisper, stageEndsAt: ends))
        clock.advance(by: 1)
        alert.follow(.monitoring)
        clock.advance(by: 10)
        #expect(v.times == [0, 0.45])
        #expect(alert.pattern == nil)
    }

    @Test func aNewDeadlineOnTheSameScreenDoesNotRestartTheRhythm() {
        let clock = ManualSessionClock(), v = RecordingVibrator(clock: clock)
        let alert = AlertVibration(clock: clock, vibrator: v)
        alert.follow(.checkIn(.whisper, stageEndsAt: ends))
        clock.advance(by: 1)
        alert.follow(.checkIn(.whisper, stageEndsAt: ends.addingTimeInterval(5)))
        clock.advance(by: 1.1)
        #expect(v.times == [0, 0.45, 2])
    }

    // MARK: Through the runtime, as the phone runs it

    @Test func aCheckInVibratesUntilTheWearerTaps() async throws {
        let clock = ManualSessionClock()
        let v = RecordingVibrator(clock: clock)
        let h = RuntimeHarness(vibrator: v)
        try await h.startDemoSession()
        try h.runtime.debugFire(1)
        await h.settle()
        #expect(!v.times.isEmpty)   // the whisper screen buzzes at once
        await h.advance(1)
        h.runtime.tapCancel()
        await h.settle()
        let atCancel = v.times.count
        await h.advance(20)
        #expect(v.times.count == atCancel)
    }

    @Test func aDuressPINLeavesThePhoneAsQuietAsASafeOne() async throws {
        let v = RecordingVibrator(clock: ManualSessionClock())
        let h = RuntimeHarness(vibrator: v)
        try await h.startDemoSession()
        try h.runtime.debugFire(3)
        await h.settle()
        await h.advance(SessionTimings.demo.whisper + SessionTimings.demo.loud + 1)   // PIN gate
        try h.runtime.pinResult("duress")
        await h.settle()
        let atPIN = v.times.count
        #expect(atPIN > 0)
        await h.advance(SessionTimings.demo.sosAfter)   // the escalation runs on, silently
        #expect(v.times.count == atPIN)
    }

    @Test func anUnansweredCheckInKeepsVibratingThroughTheAlertAndSOS() async throws {
        let v = RecordingVibrator(clock: ManualSessionClock())
        let h = RuntimeHarness(vibrator: v)
        try await h.startDemoSession()
        try h.runtime.debugFire(5)
        await h.settle()
        await h.advance(SessionTimings.demo.deadline + 2)
        let atAlert = v.times.count
        await h.advance(6)
        #expect(v.times.count > atAlert)   // "texted" screen still buzzes
        await h.advance(SessionTimings.demo.sosAfter)
        let atSOS = v.times.count
        await h.advance(2)
        #expect(v.times.count >= atSOS + 3)   // continuous on SOS
    }
}
