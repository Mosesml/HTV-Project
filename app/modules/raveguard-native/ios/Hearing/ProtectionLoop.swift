import Foundation

/// HRG-3 / C15: turns room loudness into a 0–100 protection level, one step per meter reading.
/// It eases 0.2 of the way to its target, moves at most 10 per step, skips changes of less
/// than 2, and keeps a floor that rises with dose and never falls. A step that crosses the
/// Noise Cancellation threshold is always sent, so the deadband can't hold it at 69.
struct ProtectionLoop: Equatable, Sendable {
    let config: HearingConfig
    private(set) var level: Double
    private(set) var sentLevel: Int
    private(set) var floor = 0

    /// - Parameter startLevel: the level in force now (the slider's, when switching to auto).
    init(config: HearingConfig, startLevel: Int) {
        self.config = config
        let start = min(100, max(0, startLevel))
        level = Double(start)
        sentLevel = start
    }

    /// The same loop easing on from `startLevel`, with the floor it has already reached.
    func restarted(from startLevel: Int) -> ProtectionLoop {
        var next = ProtectionLoop(config: config, startLevel: startLevel)
        next.floor = floor
        return next
    }

    /// The level that would keep the in-ear level at the wearer's target, before easing.
    static func targetLevel(roomDb: Double, loudnessTarget: Double, config: HearingConfig) -> Int {
        let over = roomDb - loudnessTarget
        return min(100, max(0, Int((over / config.spanDb * 100).rounded())))
    }

    /// One reading. Returns the level to send, or nil when it is not worth sending.
    mutating func step(roomDb: Double, loudnessTarget: Double, dosePercent: Double) -> Int? {
        let doseFloor = Int(min(1, max(0, dosePercent / 100)) * Double(config.floorAtFullDose))
        floor = max(floor, doseFloor)
        let target = max(floor, Self.targetLevel(roomDb: roomDb, loudnessTarget: loudnessTarget, config: config))

        let maxStep = Double(config.maxStepPerTick)
        let delta = min(maxStep, max(-maxStep, (Double(target) - level) * config.easing))
        level = min(100, max(0, level + delta))

        let next = Int(level.rounded())
        let crossesThreshold = (next >= config.ancThreshold) != (sentLevel >= config.ancThreshold)
        guard abs(next - sentLevel) >= config.deadband || crossesThreshold else { return nil }
        sentLevel = next
        return next
    }
}
