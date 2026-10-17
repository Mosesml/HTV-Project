import Foundation
import Testing
@testable import RaveGuardCore

/// BL1 (PRD C13–C15): the mic level, the dose and the level loop, as pure maths.
@Suite struct LevelMathTests {
    let config = HearingConfig()

    @Test func fullScaleSineIsMinusThreeDbFS() {
        let sine = (0..<4800).map { Float(sin(2 * Double.pi * 1000 * Double($0) / 48000)) }
        #expect(abs(LevelMath.dbFS(rms: LevelMath.rms(sine)) + 3.01) < 0.05)
    }

    @Test func roomDbAddsTheCalibrationOffset() {
        var calibrated = config
        calibrated.calibrationOffsetDb = 110
        #expect(abs(LevelMath.roomDb(rms: 0.1, config: calibrated) - 90) < 1e-9)
    }

    @Test func silenceGivesTheFloorNotMinusInfinity() {
        #expect(LevelMath.rms([Float](repeating: 0, count: 480)) == 0)
        #expect(LevelMath.roomDb(rms: 0, config: config) == config.silenceFloorDb)
        #expect(LevelMath.rms([Float]()) == 0)
    }
}

@Suite struct DoseTrackerTests {
    /// No attenuation, so in-ear equals room, as C14's done-when states it.
    let bare = HearingConfig(adaptiveAttenuationDb: 0, noiseCancellationAttenuationDb: 0)

    private func dose(_ db: Double, hours: Double, config: HearingConfig) -> Double {
        var tracker = DoseTracker(config: config)
        for _ in 0..<Int(hours * 3600) { tracker.add(inEarDb: db, seconds: 1) }
        return tracker.dosePercent
    }

    @Test func ninetyFourDbForOneHourIsOneHundredPercent() {
        #expect(abs(dose(94, hours: 1, config: bare) - 100) < 0.01)
    }

    @Test func eightyFiveDbForEightHoursIsOneHundredPercent() {
        #expect(abs(dose(85, hours: 8, config: bare) - 100) < 0.01)
    }

    @Test func everyThreeDbLessHalvesTheDose() {
        #expect(abs(dose(82, hours: 8, config: bare) - 50) < 0.01)
        #expect(abs(dose(97, hours: 0.5, config: bare) - 100) < 0.01)
    }

    @Test func inEarLevelSubtractsTheModesAttenuation() {
        let config = HearingConfig(adaptiveAttenuationDb: 10, noiseCancellationAttenuationDb: 20)
        #expect(DoseTracker.inEarDb(roomDb: 100, level: 50, config: config) == 90)
        #expect(DoseTracker.inEarDb(roomDb: 100, level: 70, config: config) == 80)
        #expect(DoseTracker.inEarDb(roomDb: 100, level: nil, config: config) == 100)
    }

    @Test func doseNeverFallsAndStartsAtZero() {
        var tracker = DoseTracker(config: bare)
        #expect(tracker.dosePercent == 0)
        tracker.add(inEarDb: 100, seconds: 60)
        let after = tracker.dosePercent
        tracker.add(inEarDb: 40, seconds: 60)
        #expect(tracker.dosePercent >= after)
        tracker.add(inEarDb: 100, seconds: -5)
        #expect(tracker.dosePercent >= after)
    }
}

@Suite struct ProtectionLoopTests {
    let config = HearingConfig()

    @Test func targetMapsThirtyDbOverTheLoudnessTargetToOneHundred() {
        #expect(ProtectionLoop.targetLevel(roomDb: 85, loudnessTarget: 85, config: config) == 0)
        #expect(ProtectionLoop.targetLevel(roomDb: 70, loudnessTarget: 85, config: config) == 0)
        #expect(ProtectionLoop.targetLevel(roomDb: 106, loudnessTarget: 85, config: config) == 70)
        #expect(ProtectionLoop.targetLevel(roomDb: 130, loudnessTarget: 85, config: config) == 100)
    }

    @Test func easesTwentyPercentOfTheWayEachTick() {
        var loop = ProtectionLoop(config: config, startLevel: 0)
        // Target 50 (15 dB over): 0 → 10 (capped at 10 per tick), then 18, 24.4…
        #expect(loop.step(roomDb: 100, loudnessTarget: 85, dosePercent: 0) == 10)
        #expect(loop.step(roomDb: 100, loudnessTarget: 85, dosePercent: 0) == 18)
        #expect(loop.step(roomDb: 100, loudnessTarget: 85, dosePercent: 0) == 24)
    }

    @Test func neverMovesMoreThanTenPerTick() {
        var loop = ProtectionLoop(config: config, startLevel: 0)
        var last = 0
        for _ in 0..<30 {
            if let sent = loop.step(roomDb: 130, loudnessTarget: 85, dosePercent: 0) {
                #expect(abs(sent - last) <= config.maxStepPerTick)
                last = sent
            }
        }
        #expect(last >= 99)
    }

    @Test func changesInsideTheDeadbandAreNotSent() {
        var loop = ProtectionLoop(config: config, startLevel: 50)
        // Target 53 from 50: eased to 50.6 → rounds to 51, inside the deadband of 2.
        #expect(loop.step(roomDb: 100.9, loudnessTarget: 85, dosePercent: 0) == nil)
        #expect(loop.sentLevel == 50)
    }

    @Test func crossingTheNoiseCancellationThresholdIsAlwaysSent() {
        var loop = ProtectionLoop(config: config, startLevel: 69)
        // Target 71 from 69: eased to 69.4, then 69.7, 69.9 … the first rounding to 70 is sent
        // although it is only 1 above what was sent.
        var sent: [Int] = []
        for _ in 0..<10 {
            if let level = loop.step(roomDb: 106.3, loudnessTarget: 85, dosePercent: 0) { sent.append(level) }
        }
        #expect(sent.first == 70)
    }

    @Test func crossingBackBelowTheThresholdIsAlwaysSent() {
        var loop = ProtectionLoop(config: config, startLevel: 70)
        var sent: [Int] = []
        for _ in 0..<10 {
            if let level = loop.step(roomDb: 105.7, loudnessTarget: 85, dosePercent: 0) { sent.append(level) }
        }
        #expect(sent.first == 69)
    }

    @Test func floorRisesWithDoseAndNeverFalls() {
        var loop = ProtectionLoop(config: config, startLevel: 0)
        _ = loop.step(roomDb: 60, loudnessTarget: 85, dosePercent: 50)
        #expect(loop.floor == 35)
        _ = loop.step(roomDb: 60, loudnessTarget: 85, dosePercent: 10)
        #expect(loop.floor == 35)
        _ = loop.step(roomDb: 60, loudnessTarget: 85, dosePercent: 250)
        #expect(loop.floor == config.floorAtFullDose)
    }

    @Test func aQuietRoomStillEasesUpToTheFloor() {
        var loop = ProtectionLoop(config: config, startLevel: 0)
        var last = 0
        for _ in 0..<60 {
            if let sent = loop.step(roomDb: 60, loudnessTarget: 85, dosePercent: 100) { last = sent }
        }
        #expect(last == config.floorAtFullDose)
    }

    @Test func aQuietRoomEasesDownWhenThereIsNoDose() {
        var loop = ProtectionLoop(config: config, startLevel: 80)
        var last = 80
        for _ in 0..<60 {
            if let sent = loop.step(roomDb: 60, loudnessTarget: 85, dosePercent: 0) { last = sent }
        }
        #expect(last <= config.deadband)
    }

    /// C15's done-when: a club-like dB trace played back gives no jump over 10 per second.
    @Test func replayedTraceNeverJumpsMoreThanTenPerSecond() {
        var loop = ProtectionLoop(config: config, startLevel: 0)
        var tracker = DoseTracker(config: config)
        var last = 0
        for second in 0..<1800 {
            let roomDb = Self.clubTrace(second)
            tracker.add(inEarDb: DoseTracker.inEarDb(roomDb: roomDb, level: last, config: config), seconds: 1)
            if let sent = loop.step(roomDb: roomDb, loudnessTarget: 85, dosePercent: tracker.dosePercent) {
                #expect(abs(sent - last) <= 10, "second \(second): \(last) → \(sent)")
                #expect((0...100).contains(sent))
                last = sent
            }
        }
    }

    /// 30 min: quiet bar, a drop to 104 dB with ±6 dB beats, a 2-minute break, then louder.
    static func clubTrace(_ second: Int) -> Double {
        let t = Double(second)
        let beat = 6 * sin(t * 2.1) + 3 * sin(t * 0.37)
        switch second {
        case ..<300: return 72 + 2 * sin(t * 0.5)
        case ..<1200: return 104 + beat
        case ..<1320: return 78
        default: return 108 + beat
        }
    }
}
