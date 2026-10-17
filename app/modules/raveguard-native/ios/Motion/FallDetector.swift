import Foundation

/// DET-2 / DET-6: a fall is an acceleration spike, then the head far from upright, then
/// stillness for 10 s, all three together. Thresholds start at the PRD's values; tune
/// them against `Motion/Fixtures/` with the replay harness, never on the dance floor.
struct FallDetectorConfig: Equatable, Sendable {
    /// |user acceleration| that counts as an impact. Retuned from the PRD's 2.5 g on Kean's
    /// couch takes (fall-model plan step 9, `swift run fall-lab compare`): couch falls land at
    /// 1.9–2.9 g, so 2.5 caught 3 of 10; 1.35 catches 10 of 10. Sit-downs (up to ~1.7 g) are
    /// now kept out by the 50° tilt check, not by this value. Lie-downs are not yet measured.
    var spikeG = 1.35
    /// Tilt away from the wearer's upright baseline that counts as "down".
    var tiltDeg = 50.0
    /// The head must reach `tiltDeg` within this long after the spike.
    var postureWindow: TimeInterval = 3
    /// Back under `tiltDeg - uprightHysteresisDeg` for `uprightAbortAfter` means they got up.
    var uprightHysteresisDeg = 10.0
    var uprightAbortAfter: TimeInterval = 2
    /// Stillness: mean rotation rate and mean |user acceleration| over `stillWindow`.
    var stillRotationRate = 0.35   // rad/s
    var stillAccelG = 0.08
    var stillWindow: TimeInterval = 1
    var stillFor: TimeInterval = 10
    /// Give up on a spike that hasn't turned into a fall after this long.
    var candidateTimeout: TimeInterval = 30
    /// No second fall trigger within this long of the first.
    var refractory: TimeInterval = 60
}

struct FallDetection: Equatable, Sendable {
    let t: TimeInterval
    let peakG: Double
    let tiltDeg: Double
    let direction: String     // sideways | forward | back
    let stillSeconds: Double
    let posture: Posture      // relative to the upright baseline
    /// Set when `LearnedFallDetector` made the call: the model's fall probability.
    var modelProbability: Double? = nil

    /// DET-6, e.g. "spike 3.1 g, head 70° sideways, still 10 s", or with the model
    /// "model 0.97, head 70° sideways, still 10 s".
    var reason: String {
        if let p = modelProbability {
            return String(format: "model %.2f, head %.0f° %@, still %.0f s", p, tiltDeg, direction, stillSeconds)
        }
        return String(format: "spike %.1f g, head %.0f° %@, still %.0f s",
                      peakG, tiltDeg, direction, stillSeconds)
    }
}

/// What `MotionPipeline` needs from a fall detector: the thresholds (`FallDetector`) or the
/// model (`LearnedFallDetector`).
protocol FallDetecting: AnyObject {
    var config: FallDetectorConfig { get }
    /// True while a possible fall is being followed up; the posture baseline freezes meanwhile.
    var hasCandidate: Bool { get }
    func reset()
    func process(_ s: MotionSample, baseline: PostureBaseline) -> FallDetection?
}

/// "sideways", "forward" or "back" from the posture relative to upright.
func fallDirection(_ posture: Posture) -> String {
    abs(posture.rollDeg) >= abs(posture.pitchDeg) ? "sideways" : (posture.pitchDeg < 0 ? "forward" : "back")
}

/// Rolling mean of rotation rate and acceleration over a time window.
struct StillnessWindow {
    let window: TimeInterval
    private var items: [(t: TimeInterval, rot: Double, acc: Double)] = []
    private var head = 0
    private var rotSum = 0.0, accSum = 0.0

    init(window: TimeInterval) { self.window = window }

    mutating func add(_ s: MotionSample) {
        items.append((s.t, s.rotationRate, s.accelG))
        rotSum += s.rotationRate; accSum += s.accelG
        while head < items.count, items[head].t < s.t - window {
            rotSum -= items[head].rot; accSum -= items[head].acc
            head += 1
        }
        if head > 512 { items.removeFirst(head); head = 0 }
    }

    var count: Int { items.count - head }
    var span: TimeInterval { count > 1 ? items[items.count - 1].t - items[head].t : 0 }
    var meanRotation: Double { count > 0 ? rotSum / Double(count) : 0 }
    var meanAccel: Double { count > 0 ? accSum / Double(count) : 0 }

    func isStill(rotation: Double, accel: Double) -> Bool {
        span >= window * 0.9 && meanRotation < rotation && meanAccel < accel
    }
}

/// The wearer's upright posture: the mean of the first second, then a slow average
/// (time constant `tau`) so a loose earbud or a change in stance doesn't drift into a
/// false "tilted". Frozen while a fall candidate is open.
struct PostureBaseline {
    var calibration: TimeInterval = 1
    var tau: TimeInterval = 30
    private(set) var ready = false
    private var start: TimeInterval?
    private var lastT: TimeInterval?
    private var n = 0.0
    private var g = (x: 0.0, y: 0.0, z: 0.0)
    private var pitch = 0.0, roll = 0.0
    private var useGravity = true

    mutating func add(_ s: MotionSample, frozen: Bool) {
        defer { lastT = s.t }
        if start == nil { start = s.t; useGravity = s.hasGravity }
        if !ready {
            n += 1
            g.x += (s.gravX - g.x) / n; g.y += (s.gravY - g.y) / n; g.z += (s.gravZ - g.z) / n
            pitch += (s.pitch - pitch) / n; roll += (s.roll - roll) / n
            if s.t - start! >= calibration { ready = true }
            return
        }
        guard !frozen, let lastT else { return }
        let a = min(1, max(0, s.t - lastT) / tau)
        g.x += (s.gravX - g.x) * a; g.y += (s.gravY - g.y) * a; g.z += (s.gravZ - g.z) * a
        pitch += (s.pitch - pitch) * a; roll += (s.roll - roll) * a
    }

    /// Upright gravity, for FallFeatures' direction features.
    var gravity: (x: Double, y: Double, z: Double) { g }

    /// Angle between the head now and upright, in degrees.
    func tiltDeg(_ s: MotionSample) -> Double {
        let cosine: Double
        if useGravity && s.hasGravity {
            let dot = s.gravX * g.x + s.gravY * g.y + s.gravZ * g.z
            let norms = (s.gravX * s.gravX + s.gravY * s.gravY + s.gravZ * s.gravZ).squareRoot()
                * (g.x * g.x + g.y * g.y + g.z * g.z).squareRoot()
            cosine = norms > 0 ? dot / norms : 1
        } else {
            cosine = cos(s.pitch - pitch) * cos(s.roll - roll)
        }
        return acos(min(1, max(-1, cosine))) * 180 / .pi
    }

    func relative(_ s: MotionSample) -> Posture {
        Posture(pitchDeg: (s.pitch - pitch) * 180 / .pi, rollDeg: (s.roll - roll) * 180 / .pi)
    }
}

final class FallDetector: FallDetecting {
    let config: FallDetectorConfig
    private var stillness: StillnessWindow
    private var candidate: Candidate?
    private var refractoryUntil: TimeInterval = -.infinity

    private struct Candidate {
        let spikeT: TimeInterval
        var peakG: Double
        var tilted = false
        var maxTilt = 0.0
        var uprightSince: TimeInterval?
        var stillSince: TimeInterval?
    }

    init(config: FallDetectorConfig = .init()) {
        self.config = config
        stillness = StillnessWindow(window: config.stillWindow)
    }

    /// True while a spike is being followed up; the posture baseline freezes meanwhile.
    var hasCandidate: Bool { candidate != nil }

    var isStill: Bool {
        stillness.isStill(rotation: config.stillRotationRate, accel: config.stillAccelG)
    }

    func reset() { candidate = nil; refractoryUntil = -.infinity }

    func process(_ s: MotionSample, baseline: PostureBaseline) -> FallDetection? {
        stillness.add(s)
        guard baseline.ready, s.t >= refractoryUntil else { return nil }
        let tilt = baseline.tiltDeg(s)

        if s.accelG >= config.spikeG {
            if var c = candidate, !c.tilted, s.t - c.spikeT <= config.postureWindow {
                c.peakG = max(c.peakG, s.accelG)
                candidate = c
            } else if candidate == nil || !(candidate!.tilted) {
                candidate = Candidate(spikeT: s.t, peakG: s.accelG)
            } else {
                // A second impact while already down (rolling, bouncing): keep the
                // candidate, note the bigger peak, and restart the stillness count.
                candidate!.peakG = max(candidate!.peakG, s.accelG)
                candidate!.stillSince = nil
            }
        }

        guard var c = candidate else { return nil }
        candidate = nil   // put back below only if it survives this sample

        if s.t - c.spikeT > config.candidateTimeout { return nil }
        if !c.tilted {
            if tilt >= config.tiltDeg {
                c.tilted = true
            } else if s.t - c.spikeT > config.postureWindow {
                return nil   // impact without the head going down: a jump or a sit-down
            } else {
                candidate = c
                return nil
            }
        }
        c.maxTilt = max(c.maxTilt, tilt)

        if tilt < config.tiltDeg - config.uprightHysteresisDeg {
            c.uprightSince = c.uprightSince ?? s.t
            if s.t - c.uprightSince! >= config.uprightAbortAfter { return nil }   // got up
        } else {
            c.uprightSince = nil
        }

        if isStill { c.stillSince = c.stillSince ?? s.t } else { c.stillSince = nil }
        guard let since = c.stillSince, s.t - since >= config.stillFor else {
            candidate = c
            return nil
        }

        let posture = baseline.relative(s)
        refractoryUntil = s.t + config.refractory
        return FallDetection(t: s.t, peakG: c.peakG, tiltDeg: tilt, direction: fallDirection(posture),
                             stillSeconds: s.t - since, posture: posture)
    }
}
