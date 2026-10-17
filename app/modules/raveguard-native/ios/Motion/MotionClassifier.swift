import Foundation

/// BL4 (PRD A9 / DET-5) thresholds. Tuned on synthetic clips only; replay the J4
/// recordings (`motion-probe replay`) before trusting them on people.
struct MotionClassifierConfig: Equatable, Sendable {
    /// Motion energy is the mean |rotation rate| and mean |user acceleration| over this window.
    var window: TimeInterval = 1.25
    /// A new state must hold this long before it shows. Longer than the window, so a jolt
    /// has left the window before it could change the state; a real change still shows in
    /// about 2.6 s, inside A9's 3 s.
    var hold: TimeInterval = 1.5

    /// Still: rotation below the wearer's threshold and acceleration below `stillAccelG`.
    /// The rotation threshold is `baselineShare` of their learned active rotation, kept
    /// between the floor and the ceiling; the ceiling alone until the baseline is ready.
    var stillRotationCeiling = 0.35   // rad/s, the fall detector's stillness value
    var stillRotationFloor = 0.08     // rad/s, above sensor noise
    var stillAccelG = 0.08
    var baselineShare = 0.2           // PRD: "below 20% of the wearer's dancing baseline"

    /// Dancing: either band at or above these. Walking: below them, with steps.
    var dancingAccelG = 0.3
    var dancingRotation = 1.2         // rad/s
    var walkingAccelG = 0.08

    /// PRD A10: the baseline is learned in the first 15 min of the session…
    var baselineLearnFor: TimeInterval = 15 * 60
    /// …and used once this much walking or dancing has been seen.
    var baselineReadyAfter: TimeInterval = 60
}

/// The wearer's typical rotation while walking or dancing, learned early in the session.
struct ActivityBaseline: Equatable, Sendable {
    private(set) var activeRotation = 0.0
    private(set) var activeSeconds: TimeInterval = 0
    let readyAfter: TimeInterval

    var isReady: Bool { activeSeconds >= readyAfter }

    mutating func addActive(rotation: Double, seconds: TimeInterval) {
        guard seconds > 0 else { return }
        activeSeconds += seconds
        activeRotation += (rotation - activeRotation) * seconds / activeSeconds
    }
}

/// Dancing, walking or still from motion-energy bands over a short window, with a hold so
/// the state doesn't flicker. Still is judged against the wearer's own baseline. `fallen`
/// and `unknown` beyond the first window are `MotionPipeline`'s business.
struct MotionClassifier {
    let config: MotionClassifierConfig
    private(set) var baseline: ActivityBaseline
    private(set) var state: MotionState = .unknown
    private var energy: StillnessWindow
    private var pending: (state: MotionState, since: TimeInterval)?
    private var firstT: TimeInterval?
    private var lastT: TimeInterval?

    init(config: MotionClassifierConfig = .init()) {
        self.config = config
        baseline = ActivityBaseline(readyAfter: config.baselineReadyAfter)
        energy = StillnessWindow(window: config.window)
    }

    var stillRotationThreshold: Double {
        guard baseline.isReady else { return config.stillRotationCeiling }
        let personal = config.baselineShare * baseline.activeRotation
        return min(config.stillRotationCeiling, max(config.stillRotationFloor, personal))
    }

    /// Feeds one sample; returns the state shown now.
    mutating func process(_ s: MotionSample) -> MotionState {
        let dt = min(0.1, max(0, s.t - (lastT ?? s.t)))
        lastT = s.t
        if firstT == nil { firstT = s.t }
        energy.add(s)
        guard energy.span >= config.window * 0.9 else { return state }

        let band = self.band()
        if band == .walking || band == .dancing, s.t - firstT! < config.baselineLearnFor {
            baseline.addActive(rotation: s.rotationRate, seconds: dt)
        }
        settle(on: band, at: s.t)
        return state
    }

    /// What the window looks like right now, before the hold. Nil when it's in between
    /// (moving the head without steps, say), which keeps whatever is showing.
    private func band() -> MotionState? {
        let rotation = energy.meanRotation, accel = energy.meanAccel
        if accel >= config.dancingAccelG || rotation >= config.dancingRotation { return .dancing }
        if rotation < stillRotationThreshold && accel < config.stillAccelG { return .still }
        if accel >= config.walkingAccelG { return .walking }
        return nil
    }

    private mutating func settle(on band: MotionState?, at t: TimeInterval) {
        guard let band, band != state else { pending = nil; return }
        if state == .unknown { state = band; pending = nil; return }   // first reading shows at once
        if let p = pending, p.state == band {
            if t - p.since >= config.hold { state = band; pending = nil }
        } else {
            pending = (band, t)
        }
    }
}
