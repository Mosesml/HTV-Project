import Foundation

/// A moment worth asking the fall model about: the head just tilted past
/// `FallFeatures.candidateTiltDeg` from upright.
public struct FallCandidate: Equatable, Sendable {
    public let t0: TimeInterval
    /// In `FallFeatures.names` order.
    public let features: [Double]
}

/// Fall-model candidates and features (docs/fall-model-plan.md, step 6). The app and the
/// training tool (Tools/FallLab) both call this, so the model sees the same numbers in
/// both places. Windows are relative to the candidate's moment `t0`.
public enum FallFeatures {
    /// Just under the detector's 50°, so no fall is missed.
    public static let candidateTiltDeg = 45.0
    public static let minGap: TimeInterval = 5
    public static let before: TimeInterval = 2
    public static let after: TimeInterval = 3

    public static let names = [
        "peakAccel", "meanAccel", "minTotalAccel", "peakRotation", "peakJerk",
        "tiltSeconds15to45", "peakTiltRate", "tiltAfter", "lateralAfter", "forwardAfter",
        "accelBefore", "rotationBefore", "accelAfter", "rotationAfter",
    ]

    /// Every candidate in a recording with 2 s of history and 3 s of future around it.
    public static func candidates(in samples: [MotionSample]) -> [FallCandidate] {
        guard samples.count > 1 else { return [] }
        let track = tiltTrack(samples)
        var out: [FallCandidate] = []
        var lastT0 = -Double.infinity
        for i in 1..<samples.count
        where track[i].tilt >= candidateTiltDeg && track[i - 1].tilt < candidateTiltDeg {
            let t0 = samples[i].t
            guard t0 - lastT0 >= minGap,
                  t0 - samples[0].t >= before,
                  samples[samples.count - 1].t - t0 >= after else { continue }
            lastT0 = t0
            out.append(FallCandidate(t0: t0, features: features(samples, track, at: i)))
        }
        return out
    }

    struct TiltPoint {
        let tilt: Double
        let upright: (x: Double, y: Double, z: Double)
    }

    /// Tilt from upright per sample. The baseline stops following once the head leaves
    /// upright, as the detector's does while a candidate is open.
    static func tiltTrack(_ samples: [MotionSample]) -> [TiltPoint] {
        var baseline = PostureBaseline()
        var lastTilt = 0.0
        return samples.map { s in
            baseline.add(s, frozen: lastTilt >= 30)
            lastTilt = baseline.ready ? baseline.tiltDeg(s) : 0
            return TiltPoint(tilt: lastTilt, upright: baseline.gravity)
        }
    }

    static func features(_ s: [MotionSample], _ track: [TiltPoint], at i: Int) -> [Double] {
        let t0 = s[i].t
        let window = { (a: Double, b: Double) in s.indices.filter { s[$0].t >= t0 + a && s[$0].t <= t0 + b } }
        let impact = window(-1, 1), drop = window(-1.5, 0)
        let early = window(-before, -0.5), late = window(1.5, after)
        let end = window(after - 0.1, after).last ?? i
        let up = track[i].upright
        let mean = { (idx: [Int], f: (MotionSample) -> Double) in idx.isEmpty ? 0 : idx.map { f(s[$0]) }.reduce(0, +) / Double(idx.count) }
        let peak = { (idx: [Int], f: (Int) -> Double) in idx.map(f).max() ?? 0 }
        let rate = { (j: Int, f: (Int) -> Double) -> Double in
            j > 0 && s[j].t > s[j - 1].t ? (f(j) - f(j - 1)) / (s[j].t - s[j - 1].t) : 0
        }
        return [
            peak(impact) { s[$0].accelG },
            mean(impact) { $0.accelG },
            drop.map { totalAccel(s[$0]) }.min() ?? 1,
            peak(impact) { s[$0].rotationRate },
            peak(impact) { abs(rate($0) { s[$0].accelG }) },
            secondsSinceUpright(track, s, before: i),
            peak(impact) { rate($0) { track[$0].tilt } },
            track[end].tilt,
            abs(s[end].gravX - up.x),
            s[end].gravY - up.y,
            mean(early) { $0.accelG },
            mean(early) { $0.rotationRate },
            mean(late) { $0.accelG },
            mean(late) { $0.rotationRate },
        ]
    }

    /// |user acceleration + gravity| in g: about 1 at rest, below 1 while falling.
    static func totalAccel(_ s: MotionSample) -> Double {
        let x = s.accX + s.gravX, y = s.accY + s.gravY, z = s.accZ + s.gravZ
        return (x * x + y * y + z * z).squareRoot()
    }

    /// How long the head took from 15° to `candidateTiltDeg`, capped at 3 s: falls tip over
    /// fast, lying down is slow.
    static func secondsSinceUpright(_ track: [TiltPoint], _ s: [MotionSample], before i: Int) -> Double {
        let cap = 3.0
        var j = i
        while j > 0 && track[j].tilt >= 15 && s[i].t - s[j].t < cap { j -= 1 }
        return min(cap, s[i].t - s[j].t)
    }
}
