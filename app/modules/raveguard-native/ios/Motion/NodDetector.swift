import Foundation

/// DET-4: a nod is at least 2 pitch reversals of at least 12° within 2 s, listened for
/// only while a prompt is active. Two guards keep head-bobbing to music from counting:
/// the movement must be mostly pitch, and the body must be fairly still.
struct NodDetectorConfig: Equatable, Sendable {
    var swingDeg = 12.0
    var window: TimeInterval = 2
    var minReversals = 2
    /// Low-pass on pitch before looking for reversals (EMA factor per 50 Hz sample).
    var smoothing = 0.35
    /// Roll and yaw ranges over the window may each be at most this fraction of pitch's.
    var maxOffAxisRatio = 0.8
    /// Mean |user acceleration| over the window above this means dancing, not nodding.
    var maxMeanAccelG = 0.25
    /// One nod per 2 s, so a long triple nod still counts once.
    var cooldown: TimeInterval = 2
}

final class NodDetector {
    let config: NodDetectorConfig
    private(set) var listening = false
    private var smoothed: Double?
    private var direction = 0           // +1 rising, -1 falling, 0 not yet moving
    private var reference = 0.0         // where the current swing started
    private var extreme = 0.0
    private var extremeT: TimeInterval = 0
    private var reversals: [TimeInterval] = []
    private var history: [(t: TimeInterval, pitch: Double, roll: Double, yaw: Double, acc: Double)] = []
    private var lastYaw: Double?
    private var unwrappedYaw = 0.0
    private var cooldownUntil: TimeInterval = -.infinity

    init(config: NodDetectorConfig = .init()) { self.config = config }

    func setListening(_ on: Bool) {
        if on && !listening { resetSwings() }
        listening = on
    }

    private func resetSwings() {
        smoothed = nil; direction = 0; reversals = []; history = []; lastYaw = nil
    }

    /// Returns the time of a detected nod.
    func process(_ s: MotionSample) -> TimeInterval? {
        guard listening else { return nil }
        let raw = s.pitchDeg
        let p = smoothed.map { $0 + (raw - $0) * config.smoothing } ?? raw
        smoothed = p

        if let last = lastYaw {
            var d = s.yawDeg - last
            if d > 180 { d -= 360 } else if d < -180 { d += 360 }
            unwrappedYaw += d
        }
        lastYaw = s.yawDeg
        history.append((s.t, p, s.rollDeg, unwrappedYaw, s.accelG))
        history.removeAll { $0.t < s.t - config.window }

        switch direction {
        case 0:
            if history.count == 1 { reference = p }
            if p - reference >= config.swingDeg { direction = 1; extreme = p; extremeT = s.t }
            else if reference - p >= config.swingDeg { direction = -1; extreme = p; extremeT = s.t }
        case 1:
            if p > extreme { extreme = p; extremeT = s.t }
            else if extreme - p >= config.swingDeg { reversals.append(extremeT); direction = -1; extreme = p; extremeT = s.t }
        default:
            if p < extreme { extreme = p; extremeT = s.t }
            else if p - extreme >= config.swingDeg { reversals.append(extremeT); direction = 1; extreme = p; extremeT = s.t }
        }
        reversals.removeAll { $0 < s.t - config.window }
        if s.t < cooldownUntil { reversals = []; return nil }   // the tail of the last nod

        guard reversals.count >= config.minReversals, guardsPass() else { return nil }
        cooldownUntil = s.t + config.cooldown
        reversals = []
        return s.t
    }

    private func guardsPass() -> Bool {
        guard history.count > 1 else { return false }
        func range(_ key: KeyPath<(t: TimeInterval, pitch: Double, roll: Double, yaw: Double, acc: Double), Double>) -> Double {
            let values = history.map { $0[keyPath: key] }
            return values.max()! - values.min()!
        }
        let pitchRange = range(\.pitch)
        guard pitchRange > 0 else { return false }
        let meanAcc = history.map(\.acc).reduce(0, +) / Double(history.count)
        return range(\.roll) <= config.maxOffAxisRatio * pitchRange
            && range(\.yaw) <= config.maxOffAxisRatio * pitchRange
            && meanAcc <= config.maxMeanAccelG
    }
}
