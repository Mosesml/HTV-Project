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
    /// The most one sample counts for, so a throttled 5 Hz stream still learns in time.
    var maxSampleInterval: TimeInterval = 0.5
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
/// the state doesn't flicker. Still is judged against the wearer's own baseline. Moving
/// the head without steps (nodding along, looking around) ends `still` and shows `unknown`,
/// so the stillness countdown stops. `fallen` is `MotionPipeline`'s business.
struct MotionClassifier {
    let config: MotionClassifierConfig
    private(set) var baseline: ActivityBaseline
    private(set) var state: MotionState = .unknown
    private var energy: StillnessWindow
    private var pending: (state: MotionState, since: TimeInterval)?
    private var hasShownState = false
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
        if let lastT, s.t - lastT > config.window {
            // A gap (AirPods out and back): the window and any pending change start over,
            // so the hold can't be skipped.
            energy = StillnessWindow(window: config.window)
            pending = nil
        }
        let dt = min(config.maxSampleInterval, max(0, s.t - (lastT ?? s.t)))
        lastT = s.t
        if firstT == nil { firstT = s.t }
        energy.add(s)
        guard energy.span >= config.window * 0.9 else { return state }

        let band = self.band()
        settle(on: band, at: s.t)
        // Learn only from activity that has held, never a lone jolt or a fall's tumble.
        let isActive = state == .walking || state == .dancing
        if isActive, band == state, s.t - firstT! < config.baselineLearnFor {
            baseline.addActive(rotation: s.rotationRate, seconds: dt)
        }
        return state
    }

    /// What the window looks like right now, before the hold. Nil when it's in between
    /// (moving the head without steps, say): that keeps walking or dancing showing, but
    /// ends still.
    private func band() -> MotionState? {
        let rotation = energy.meanRotation, accel = energy.meanAccel
        if accel >= config.dancingAccelG || rotation >= config.dancingRotation { return .dancing }
        if rotation < stillRotationThreshold && accel < config.stillAccelG { return .still }
        if accel >= config.walkingAccelG { return .walking }
        return nil
    }

    private mutating func settle(on band: MotionState?, at t: TimeInterval) {
        let target = band ?? (state == .still ? MotionState.unknown : nil)
        guard let target, target != state else { pending = nil; return }
        if !hasShownState {   // the first reading shows at once
            state = target
            hasShownState = true
            pending = nil
            return
        }
        if let p = pending, p.state == target {
            if t - p.since >= config.hold { state = target; pending = nil }
        } else {
            pending = (target, t)
        }
    }
}
