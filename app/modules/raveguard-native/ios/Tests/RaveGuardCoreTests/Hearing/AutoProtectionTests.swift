import Foundation
import Testing
@testable import RaveGuardCore

/// A level source the test drives by hand, standing in for the real mic meter.
@MainActor
final class ScriptedLevelSource: LevelSource {
    var onReading: ((Double) -> Void)?
    private(set) var isRunning = false
    func start() { isRunning = true }
    func stop() { isRunning = false }
    func send(_ roomDb: Double) { onReading?(roomDb) }
}

/// BL1: the coordinator that owns the dose and the loop for one session.
@Suite struct AutoProtectionUnitTests {
    let config = HearingConfig()

    @Test func beginStartsAutomaticWithNoReadings() {
        var protection = AutoProtection(config: config)
        _ = protection.setMode(.manual, level: 0)
        protection.begin(level: 30)
        #expect(protection.hearing == HearingState(roomDb: nil, dosePercent: nil, mode: .auto))
    }

    @Test func aReadingUpdatesRoomDbAndDoseAndReturnsALevel() throws {
        var protection = AutoProtection(config: config)
        protection.begin(level: 0)
        let level = protection.reading(roomDb: 110, level: 0, loudnessTarget: 85)
        #expect(level == 10)
        #expect(protection.hearing.roomDb == 110)
        #expect(try #require(protection.hearing.dosePercent) > 0)
    }

    @Test func manualKeepsMeasuringButNeverReturnsALevel() throws {
        var protection = AutoProtection(config: config)
        protection.begin(level: 0)
        let changed = protection.setMode(.manual, level: 0)
        #expect(changed)
        #expect(protection.reading(roomDb: 110, level: 0, loudnessTarget: 85) == nil)
        #expect(protection.hearing.roomDb == 110)
        #expect(try #require(protection.hearing.dosePercent) > 0)
    }

    @Test func switchingBackToAutoEasesFromTheSlidersLevel() {
        var protection = AutoProtection(config: config)
        protection.begin(level: 0)
        _ = protection.setMode(.manual, level: 0)
        let changed = protection.setMode(.auto, level: 60)
        #expect(changed)
        // Target 83 (25 dB over) from 60: one step of 0.2 × 23 = 4.6 → 65.
        #expect(protection.reading(roomDb: 110, level: 60, loudnessTarget: 85) == 65)
    }

    @Test func setModeReportsWhetherAnythingChanged() {
        var protection = AutoProtection(config: config)
        let changes = [protection.setMode(.auto, level: 0),
                       protection.setMode(.manual, level: 0),
                       protection.setMode(.manual, level: 0)]
        #expect(changes == [false, true, false])
    }

    @Test func endClearsTheReadingsAndKeepsTheMode() {
        var protection = AutoProtection(config: config)
        protection.begin(level: 0)
        _ = protection.reading(roomDb: 100, level: 0, loudnessTarget: 85)
        _ = protection.setMode(.manual, level: 0)
        protection.end()
        #expect(protection.hearing == HearingState(roomDb: nil, dosePercent: nil, mode: .manual))
    }
}

/// BL1 through the runtime, as JavaScript sees it.
@MainActor
@Suite struct AutoProtectionRuntimeTests {

    private func levels(_ h: RuntimeHarness) -> [Int] {
        h.payloads(.onNoise).compactMap { $0["level"] as? Int }
    }

    /// Demo mode runs the canned club trace, so the screens show real-looking numbers.
    @Test func demoSessionReportsRoomDbAndDoseEverySecond() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        let before = h.payloads(.onHearing).count
        h.clock.advance(by: 3)
        let hearing = h.payloads(.onHearing).dropFirst(before)
        #expect(hearing.count == 3)
        let last = try #require(hearing.last)
        #expect(last["roomDb"] is Double)
        #expect(last["dosePercent"] is Double)
        #expect(last["mode"] as? String == "auto")
    }

    @Test func theLoopDrivesTheNoiseControllerInStepsOfAtMostTen() async throws {
        let noise = FakeNoiseController()
        let h = RuntimeHarness(noise: noise)
        try await h.startDemoSession()
        h.clock.advance(by: 90)
        let sent = levels(h)
        #expect(!sent.isEmpty)
        #expect(zip([0] + sent, sent).allSatisfy { abs($1 - $0) <= 10 })
        #expect(noise.level == sent.last)
        #expect((h.runtime.snapshot()["noise"] as? [String: Any?])?["level"] as? Int == sent.last)
        #expect(sent.contains { $0 >= HearingConfig().ancThreshold })
    }

    @Test func theSliderStopsTheLoopButReadingsCarryOn() async throws {
        let noise = FakeNoiseController()
        let h = RuntimeHarness(noise: noise)
        try await h.startDemoSession()
        h.clock.advance(by: 5)
        try h.runtime.setProtectionLevel(25)
        let noiseEvents = h.payloads(.onNoise).count
        let hearingEvents = h.payloads(.onHearing).count
        h.clock.advance(by: 60)
        #expect(h.payloads(.onNoise).count == noiseEvents)
        #expect(noise.level == 25)
        #expect(h.payloads(.onHearing).count == hearingEvents + 60)
        #expect(h.payloads(.onHearing).last?["mode"] as? String == "manual")
    }

    @Test func autoAgainResumesFromTheSlidersLevel() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        try h.runtime.setProtectionLevel(25)
        try h.runtime.setProtectionMode("auto")
        h.clock.advance(by: 90)
        let resumed = levels(h).drop { $0 == 25 }
        #expect(abs(try #require(resumed.first) - 25) <= 10)
    }

    /// Outside demo mode there is no level source until the real mic lands, so nothing
    /// pretends to measure the room.
    @Test func realSessionWithoutAMicReportsNothing() async throws {
        let h = RuntimeHarness()
        try await h.startRealSession()
        h.clock.advance(by: 10)
        #expect(h.payloads(.onHearing).allSatisfy { $0["roomDb"]! == nil && $0["dosePercent"]! == nil })
        #expect(h.payloads(.onNoise).isEmpty)
    }

    @Test func realSessionUsesTheInjectedLevelSource() async throws {
        let mic = ScriptedLevelSource()
        let h = RuntimeHarness(levels: mic)
        try await h.startRealSession()
        #expect(mic.isRunning)
        mic.send(101)
        #expect(h.payloads(.onHearing).last?["roomDb"] as? Double == 101)
        #expect(levels(h) == [10])
        #expect(h.runtime.stopSession())
        #expect(!mic.isRunning)
    }

    @Test func stopClearsTheReadingsAndStopsTheFeed() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        h.clock.advance(by: 3)
        #expect(h.runtime.stopSession())
        let last = try #require(h.payloads(.onHearing).last)
        #expect(last["roomDb"]! == nil)
        #expect(last["dosePercent"]! == nil)
        let count = h.payloads(.onHearing).count
        h.clock.advance(by: 5)
        #expect(h.payloads(.onHearing).count == count)
    }

    @Test func aNewSessionStartsAutomaticWithZeroDose() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        h.clock.advance(by: 30)
        try h.runtime.setProtectionLevel(10)
        #expect(h.runtime.stopSession())
        h.runtime.startSession()
        await h.settle()
        h.clock.advance(by: 1)
        let hearing = try #require(h.payloads(.onHearing).last)
        #expect(hearing["mode"] as? String == "auto")
        #expect(try #require(hearing["dosePercent"] as? Double) < 0.1)
    }

    /// The loop keeps protecting through a check-in; the ladder is untouched.
    @Test func protectionCarriesOnThroughACheckIn() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        try h.runtime.debugFire(1)
        await h.settle()
        let count = h.payloads(.onHearing).count
        h.clock.advance(by: 3)
        #expect(h.payloads(.onHearing).count == count + 3)
        #expect(h.lastPhase()?["phase"] as? String == "checkIn")
    }
}

@Suite struct CannedLevelFeedTests {
    @Test func traceRampsFromABarToAClubAndStaysInRange() {
        #expect(CannedLevelFeed.roomDb(elapsed: 0) < 80)
        #expect(CannedLevelFeed.roomDb(elapsed: 90) > 100)
        for second in 0..<600 {
            #expect((60...115).contains(CannedLevelFeed.roomDb(elapsed: TimeInterval(second))))
        }
    }
}
