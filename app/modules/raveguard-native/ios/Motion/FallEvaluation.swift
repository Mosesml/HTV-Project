import Foundation

/// Public entry points for evaluating fall detectors offline (Tools/FallLab, fall-model
/// plan step 9). They run the app's own `FallDetector`, `PostureBaseline` and stillness
/// check, so an offline comparison measures exactly what ships.
public enum FallEvaluation {
    /// The app's default impact threshold, in g.
    public static let defaultSpikeG = FallDetectorConfig().spikeG

    /// When today's threshold detector fires on a recording, with only the impact
    /// threshold changed. Fed the way `MotionPipeline` feeds it.
    public static func thresholdDetections(in samples: [MotionSample], spikeG: Double) -> [TimeInterval] {
        var config = FallDetectorConfig()
        config.spikeG = spikeG
        let detector = FallDetector(config: config)
        var baseline = PostureBaseline()
        var detections: [TimeInterval] = []
        for s in samples {
            baseline.add(s, frozen: detector.hasCandidate)
            if let d = detector.process(s, baseline: baseline) { detections.append(d.t) }
        }
        return detections
    }

    /// When the detector's stillness check (mean rotation and acceleration over 1 s, held
    /// for 10 s) completes after `t0`, or nil if it doesn't within the candidate timeout.
    /// This is the confirmation a learned candidate still needs before anything fires.
    public static func stillnessConfirmed(in samples: [MotionSample], after t0: TimeInterval) -> TimeInterval? {
        let config = FallDetectorConfig()
        var window = StillnessWindow(window: config.stillWindow)
        var since: TimeInterval?
        for s in samples {
            window.add(s)
            guard s.t >= t0 else { continue }
            if s.t - t0 > config.candidateTimeout { return nil }
            guard window.isStill(rotation: config.stillRotationRate, accel: config.stillAccelG) else {
                since = nil
                continue
            }
            since = since ?? s.t
            if let start = since, s.t - start >= config.stillFor { return s.t }
        }
        return nil
    }
}
