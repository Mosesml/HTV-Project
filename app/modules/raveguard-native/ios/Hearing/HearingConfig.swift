import Foundation

/// Every number automatic protection (backlog BL1, PRD HRG-1–3) uses, in one place to tune.
struct HearingConfig: Equatable, Sendable {
    // HRG-1: the mic level.
    /// Added to dBFS to give room dB SPL. Set on a device against an SPL meter app (C13).
    var calibrationOffsetDb: Double = 100
    /// Reported for digital silence instead of minus infinity.
    var silenceFloorDb: Double = 30
    /// How often the meter reports, and how much exposure each reading counts for.
    var readingInterval: TimeInterval = 1

    // HRG-2: the dose. 85 dB for 8 h with a 3 dB exchange rate is 100%.
    var referenceDb: Double = 85
    var referenceHours: Double = 8
    var exchangeRateDb: Double = 3
    /// Placeholders until measured: how much each AirPods mode takes off the room level.
    /// They make the dose an estimate, which the screens say.
    var adaptiveAttenuationDb: Double = 10
    var noiseCancellationAttenuationDb: Double = 20

    // HRG-3: the level loop.
    /// Matches `ShortcutsController`: Noise Cancellation from this level, Adaptive below.
    var ancThreshold = 70
    /// Room dB above the wearer's loudness target that maps to level 100.
    var spanDb: Double = 30
    var easing: Double = 0.2
    /// A new level within this of the last one sent is not sent.
    var deadband = 2
    var maxStepPerTick = 10
    /// The floor at 100% dose; it rises in proportion to the dose before that.
    var floorAtFullDose = 70
}

/// HRG-1: microphone samples to room dB SPL.
enum LevelMath {
    static func rms<C: Collection>(_ samples: C) -> Double where C.Element == Float {
        guard !samples.isEmpty else { return 0 }
        let sumOfSquares = samples.reduce(0.0) { $0 + Double($1) * Double($1) }
        return (sumOfSquares / Double(samples.count)).squareRoot()
    }

    /// -infinity for silence; `roomDb` turns that into the floor.
    static func dbFS(rms: Double) -> Double { 20 * log10(rms) }

    static func roomDb(rms: Double, config: HearingConfig) -> Double {
        guard rms > 0 else { return config.silenceFloorDb }
        return max(config.silenceFloorDb, dbFS(rms: rms) + config.calibrationOffsetDb)
    }
}
