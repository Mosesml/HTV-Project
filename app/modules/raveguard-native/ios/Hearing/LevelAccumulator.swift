import Foundation

/// HRG-1 / C13: adds up mic samples and gives one room-dB reading per `readingInterval` of
/// audio. Pure, so `swift test` covers what `MicLevelSource` does on the audio thread.
struct LevelAccumulator: Sendable {
    let config: HearingConfig
    private let framesPerReading: Int
    private var sumOfSquares = 0.0
    private var frames = 0

    /// A sample rate of 0 (no input) never reports.
    init(config: HearingConfig, sampleRate: Double) {
        self.config = config
        let perReading = sampleRate * config.readingInterval
        framesPerReading = perReading >= 1 ? Int(perReading) : .max
    }

    /// Returns a reading once a full interval has been added, then starts the next one.
    mutating func add<C: Collection>(_ samples: C) -> Double? where C.Element == Float {
        for sample in samples { sumOfSquares += Double(sample) * Double(sample) }
        frames += samples.count
        guard frames >= framesPerReading else { return nil }
        let rms = (sumOfSquares / Double(frames)).squareRoot()
        sumOfSquares = 0
        frames = 0
        return LevelMath.roomDb(rms: rms, config: config)
    }
}
