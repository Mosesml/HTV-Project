import Foundation
import Testing
@testable import RaveGuardCore

/// HRG-1: mic buffers in, one room-dB reading per `readingInterval` out.
@Suite struct LevelAccumulatorTests {
    let config = HearingConfig(calibrationOffsetDb: 100)
    let sampleRate = 48_000.0

    private func buffer(amplitude: Float, frames: Int = 4800) -> [Float] {
        [Float](repeating: amplitude, count: frames)
    }

    @Test func nothingUntilAFullIntervalOfAudio() {
        var accumulator = LevelAccumulator(config: config, sampleRate: sampleRate)
        for _ in 0..<9 { #expect(accumulator.add(buffer(amplitude: 0.1)) == nil) }
        #expect(accumulator.add(buffer(amplitude: 0.1)) != nil)
    }

    @Test func oneSecondOfConstantLevelGivesItsCalibratedDb() throws {
        var accumulator = LevelAccumulator(config: config, sampleRate: sampleRate)
        var reading: Double?
        for _ in 0..<10 { reading = accumulator.add(buffer(amplitude: 0.1)) ?? reading }
        // RMS 0.1 is -20 dBFS; +100 calibration gives 80 dB.
        #expect(abs(try #require(reading) - 80) < 1e-6)
    }

    @Test func eachIntervalStartsAfresh() throws {
        var accumulator = LevelAccumulator(config: config, sampleRate: sampleRate)
        for _ in 0..<10 { _ = accumulator.add(buffer(amplitude: 1)) }
        var reading: Double?
        for _ in 0..<10 { reading = accumulator.add(buffer(amplitude: 0.01)) ?? reading }
        #expect(abs(try #require(reading) - 60) < 1e-6)
    }

    @Test func silenceReadsAsTheFloor() throws {
        var accumulator = LevelAccumulator(config: config, sampleRate: sampleRate)
        let reading = accumulator.add(buffer(amplitude: 0, frames: 48_000))
        #expect(try #require(reading) == config.silenceFloorDb)
    }

    @Test func aSampleRateOfZeroNeverReports() {
        var accumulator = LevelAccumulator(config: config, sampleRate: 0)
        #expect(accumulator.add(buffer(amplitude: 0.5, frames: 96_000)) == nil)
    }
}
