import Foundation

/// HRG-2 / C14: noise dose against 85 dB for 8 h with a 3 dB exchange rate, from the in-ear
/// level (room dB minus what the current AirPods mode takes off). An estimate: the
/// attenuation figures are placeholders until measured.
struct DoseTracker: Equatable, Sendable {
    let config: HearingConfig
    private(set) var dosePercent: Double = 0

    init(config: HearingConfig) { self.config = config }

    /// Counts `seconds` at `inEarDb`. Every 3 dB above 85 halves the time allowed.
    mutating func add(inEarDb: Double, seconds: TimeInterval) {
        guard seconds > 0 else { return }
        let allowedSeconds = config.referenceHours * 3600
            / pow(2, (inEarDb - config.referenceDb) / config.exchangeRateDb)
        dosePercent += seconds / allowedSeconds * 100
    }

    /// The protection level picks the mode, as `ShortcutsController` maps it.
    static func inEarDb(roomDb: Double, level: Int, config: HearingConfig) -> Double {
        let attenuation = level >= config.ancThreshold
            ? config.noiseCancellationAttenuationDb
            : config.adaptiveAttenuationDb
        return roomDb - attenuation
    }
}
