import Foundation

/// The model's fall detector (fall-model plan step 10). A candidate opens when the head
/// passes `FallFeatures.candidateTiltDeg` from upright; 3 s later the model scores it on
/// `FallFeatures`, the same code fall-lab trained on; a candidate it calls a fall still
/// needs the thresholds' stillness (10 s) before it fires. Getting up, the candidate
/// timeout and the refractory period come from `FallDetectorConfig`, as for `FallDetector`.
final class LearnedFallDetector: FallDetecting {
    let config: FallDetectorConfig
    private let cutOff: Double
    private let probability: ([Double]) -> Double?
    /// Recent samples and their tilt, enough for a candidate's features (2 s before, 3 s
    /// after) for as long as a candidate can stay open.
    private var samples: [MotionSample] = []
    private var track: [FallFeatures.TiltPoint] = []
    private var stillness: StillnessWindow
    private var candidate: Candidate?
    private var refractoryUntil: TimeInterval = -.infinity
    private var lastTilt = 0.0
    private var firstT: TimeInterval?

    private struct Candidate {
        let t0: TimeInterval
        var probability: Double?
        var peakG = 0.0
        var stillSince: TimeInterval?
        var uprightSince: TimeInterval?
    }

    init(config: FallDetectorConfig = .init(), cutOff: Double = FallModel.cutOff,
         probability: @escaping ([Double]) -> Double?) {
        self.config = config
        self.cutOff = cutOff
        self.probability = probability
        stillness = StillnessWindow(window: config.stillWindow)
    }

    /// The live detector, or nil when the model can't load (the app then uses the thresholds).
    static func live(config: FallDetectorConfig) -> LearnedFallDetector? {
        guard let model = FallModel.shared else { return nil }
        return LearnedFallDetector(config: config, probability: model.probability)
    }

    var hasCandidate: Bool { candidate != nil }

    func reset() { candidate = nil; refractoryUntil = -.infinity }

    func process(_ s: MotionSample, baseline: PostureBaseline) -> FallDetection? {
        stillness.add(s)
        let tilt = baseline.ready ? baseline.tiltDeg(s) : 0
        remember(s, FallFeatures.TiltPoint(tilt: tilt, upright: baseline.gravity))
        defer { lastTilt = tilt }
        if candidate == nil {
            let start = firstT ?? s.t
            guard baseline.ready, s.t >= refractoryUntil, s.t - start >= FallFeatures.before,
                  tilt >= FallFeatures.candidateTiltDeg, lastTilt < FallFeatures.candidateTiltDeg else { return nil }
            candidate = Candidate(t0: s.t)
        }
        return follow(s, tilt: tilt, baseline: baseline)
    }

    private func follow(_ s: MotionSample, tilt: Double, baseline: PostureBaseline) -> FallDetection? {
        guard var c = candidate else { return nil }
        candidate = nil   // put back below only if it survives this sample
        if s.t - c.t0 > config.candidateTimeout { return nil }

        if tilt < config.tiltDeg - config.uprightHysteresisDeg {
            c.uprightSince = c.uprightSince ?? s.t
            if s.t - c.uprightSince! >= config.uprightAbortAfter { return nil }   // got up
        } else {
            c.uprightSince = nil
        }
        let still = stillness.isStill(rotation: config.stillRotationRate, accel: config.stillAccelG)
        c.stillSince = still ? (c.stillSince ?? s.t) : nil

        if c.probability == nil {
            guard s.t - c.t0 >= FallFeatures.after else { candidate = c; return nil }
            guard let scored = score(c.t0), scored.p >= cutOff else { return nil }
            c.probability = scored.p
            c.peakG = scored.peakG
        }
        guard let since = c.stillSince, s.t - since >= config.stillFor else { candidate = c; return nil }

        let posture = baseline.relative(s)
        refractoryUntil = s.t + config.refractory
        return FallDetection(t: s.t, peakG: c.peakG, tiltDeg: tilt, direction: fallDirection(posture),
                             stillSeconds: s.t - since, posture: posture, modelProbability: c.probability)
    }

    /// The model's verdict on the candidate at `t0`, and its impact for the log.
    private func score(_ t0: TimeInterval) -> (p: Double, peakG: Double)? {
        guard let i = samples.firstIndex(where: { $0.t >= t0 }) else { return nil }
        let features = FallFeatures.features(samples, track, at: i)
        guard let p = probability(features) else { return nil }
        return (p, features[0])   // features[0] is the peak impact ("peakAccel")
    }

    /// Keeps 40 s: the candidate timeout (30 s) plus the 2 s before it, with room to spare.
    private func remember(_ s: MotionSample, _ point: FallFeatures.TiltPoint) {
        firstT = firstT ?? s.t
        samples.append(s)
        track.append(point)
        guard samples.count > 3000, let keepFrom = samples.firstIndex(where: { $0.t >= s.t - 40 }) else { return }
        samples.removeFirst(keepFrom)
        track.removeFirst(keepFrom)
    }
}
