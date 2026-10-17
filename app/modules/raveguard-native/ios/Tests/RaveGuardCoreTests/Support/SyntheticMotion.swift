import Foundation
@testable import RaveGuardCore

/// Deterministic synthetic head motion for exercising the detectors and the replay
/// harness before real recordings exist. These clips encode our assumptions about what
/// falls, nods and dancing look like; they prove the code does what we meant, not that
/// the thresholds work on real people. J6/J7 are only done on `Motion/Fixtures/`.
struct SyntheticMotion {
    static let rate = 50.0
    private var rng: SplitMix64

    init(seed: UInt64) { rng = SplitMix64(seed: seed) }

    mutating func uniform(_ a: Double, _ b: Double) -> Double { a + (b - a) * rng.nextDouble() }
    mutating func noise(_ sd: Double) -> Double {
        // Box–Muller
        let u1 = max(rng.nextDouble(), 1e-12), u2 = rng.nextDouble()
        return sd * (-2 * log(u1)).squareRoot() * cos(2 * .pi * u2)
    }

    /// Builds a take from angle tracks (degrees) and an acceleration track (g, magnitude
    /// split across axes). Rotation rate is the angles' derivative plus noise.
    mutating func take(label: String, duration: TimeInterval,
                       angles: (TimeInterval) -> (pitch: Double, roll: Double, yaw: Double),
                       accel: (TimeInterval) -> Double,
                       rotNoise: Double = 0.02, accNoise: Double = 0.01) -> MotionCSV.Take {
        let dt = 1 / Self.rate
        var samples: [MotionSample] = []
        var prev = angles(0)
        var t = 0.0
        while t <= duration {
            let a = angles(t)
            let rad = Double.pi / 180
            let p = a.pitch * rad, r = a.roll * rad, y = a.yaw * rad
            let rx = (a.pitch - prev.pitch) * rad / dt + noise(rotNoise)
            let ry = (a.roll - prev.roll) * rad / dt + noise(rotNoise)
            let rz = (a.yaw - prev.yaw) * rad / dt + noise(rotNoise)
            let mag = max(0, accel(t))
            let ax = mag * 0.6 + noise(accNoise), ay = mag * 0.5 + noise(accNoise), az = mag * 0.62 + noise(accNoise)
            samples.append(MotionSample(t: t, pitch: p, roll: r, yaw: y,
                                        rotX: rx, rotY: ry, rotZ: rz,
                                        accX: ax, accY: ay, accZ: az,
                                        gravX: cos(p) * sin(r), gravY: sin(p), gravZ: -cos(p) * cos(r)))
            prev = a
            t += dt
        }
        return MotionCSV.Take(meta: ["label": label, "source": "synthetic"], samples: samples)
    }

    static func bump(_ t: TimeInterval, at c: TimeInterval, width: TimeInterval) -> Double {
        exp(-pow((t - c) / width, 2))
    }
    static func smoothstep(_ t: TimeInterval, from a: TimeInterval, to b: TimeInterval) -> Double {
        let x = min(1, max(0, (t - a) / (b - a)))
        return x * x * (3 - 2 * x)
    }

    // MARK: Classes

    mutating func fall(variant: Int) -> MotionCSV.Take {
        let fallAt = uniform(2.5, 4)
        let sideways = variant % 3 != 2
        let sign: Double = variant % 2 == 0 ? 1 : -1
        let finalRoll = sideways ? sign * uniform(60, 88) : uniform(-15, 15)
        let finalPitch = sideways ? uniform(-20, 20) : -uniform(60, 85)
        let peak = uniform(2.8, 4.5)
        let twitchAt = variant == 4 ? fallAt + 7 : nil   // one take twitches while down
        return take(label: "fall", duration: fallAt + 22, angles: { t in
            let k = Self.smoothstep(t, from: fallAt, to: fallAt + 0.6)
            let sway = (1 - k) * 2 * sin(2 * .pi * 0.7 * t)
            var pitch = finalPitch * k + sway, roll = finalRoll * k
            if let tw = twitchAt { roll += 6 * Self.bump(t, at: tw, width: 0.25) }
            return (pitch, roll, 10 * sin(0.3 * t) * (1 - k))
        }, accel: { t in
            let settle = t > fallAt + 0.6 && t < fallAt + 1.6 ? 0.15 : 0
            let base = t < fallAt ? 0.04 : 0.005
            var a = base + peak * Self.bump(t, at: fallAt + 0.5, width: 0.05) + settle
            if let tw = twitchAt { a += 0.3 * Self.bump(t, at: tw, width: 0.25) }
            return a
        })
    }

    mutating func sitDown(variant: Int) -> MotionCSV.Take {
        let at = uniform(2, 3)
        let lean = uniform(8, 25)
        let peak = variant == 3 ? 2.8 : uniform(1.1, 2.2)   // one hard sit with a real spike
        return take(label: "sitdown", duration: at + 10, angles: { t in
            let k = Self.smoothstep(t, from: at, to: at + 1)
            let dip = 15 * Self.bump(t, at: at + 0.5, width: 0.3)   // lean forward while sitting
            return (-(lean * k) - dip, 4 * k, 0)
        }, accel: { t in
            0.04 + peak * Self.bump(t, at: at + 0.9, width: 0.06) + (t > at && t < at + 1 ? 0.2 : 0)
        })
    }

    mutating func nod(variant: Int) -> MotionCSV.Take {
        let at = uniform(1.5, 2.5)
        let amp = uniform(15, 24)
        let freq = uniform(1.4, 2.4)
        let cycles = variant % 3 == 0 ? 3.0 : 2.0
        let end = at + cycles / freq
        return take(label: "nod", duration: end + 2, angles: { t in
            let inNod = t >= at && t <= end
            let pitch = inNod ? -amp / 2 * (1 - cos(2 * .pi * freq * (t - at))) : 0
            return (pitch + 1.5 * sin(2 * .pi * 0.5 * t), 1.5 * sin(2 * .pi * 0.8 * t), 2 * sin(0.4 * t))
        }, accel: { t in 0.06 + 0.03 * sin(2 * .pi * 2 * t) }, accNoise: 0.02)
    }

    /// Five minutes of dancing: head bobbing on the beat, sway, turns, jumps landing at
    /// up to 3.8 g, and the odd head-bang past 50°.
    mutating func dancing(minutes: Double = 5) -> MotionCSV.Take {
        let bpm = uniform(120, 132), beat = bpm / 60
        let bob = uniform(8, 14)
        var jumps: [(t: Double, g: Double, bang: Bool)] = []
        var t = uniform(2, 5)
        while t < minutes * 60 {
            jumps.append((t, uniform(2.4, 3.8), uniform(0, 1) < 0.25))
            t += uniform(3, 9)
        }
        let turnPhase = uniform(0, 6)
        return take(label: "dancing", duration: minutes * 60, angles: { t in
            var pitch = bob * sin(2 * .pi * beat * t)
            let roll = 8 * sin(2 * .pi * beat / 2 * t + 1)
            let yaw = 25 * sin(2 * .pi * 0.15 * t + turnPhase) + 15 * sin(2 * .pi * beat / 4 * t)
            for j in jumps where abs(t - j.t) < 1 && j.bang {
                pitch -= 55 * Self.bump(t, at: j.t + 0.1, width: 0.2)
            }
            return (pitch, roll, yaw)
        }, accel: { t in
            var a = 0.35 + 0.2 * abs(sin(2 * .pi * beat * t))
            for j in jumps where abs(t - j.t) < 0.5 { a += j.g * Self.bump(t, at: j.t, width: 0.05) }
            return a
        }, rotNoise: 0.15, accNoise: 0.08)
    }

    mutating func walking(minutes: Double = 3) -> MotionCSV.Take {
        let step = uniform(1.7, 2.0)
        return take(label: "walking", duration: minutes * 60, angles: { t in
            (3 * sin(2 * .pi * step * t), 2 * sin(2 * .pi * step / 2 * t), 30 * sin(2 * .pi * 0.03 * t))
        }, accel: { t in 0.12 + 0.08 * abs(sin(2 * .pi * step * t)) }, rotNoise: 0.05, accNoise: 0.03)
    }

    /// Standing (or sitting) still: tiny sway, breathing, sensor noise (BL3, BL4).
    mutating func still(minutes: Double = 1, label: String = "still") -> MotionCSV.Take {
        let breath = uniform(0.2, 0.3)
        return take(label: label, duration: minutes * 60, angles: { t in
            (0.8 * sin(2 * .pi * breath * t), 0.5 * sin(2 * .pi * 0.1 * t), 0)
        }, accel: { t in 0.03 + 0.005 * sin(2 * .pi * breath * t) })
    }

    /// Dancing, then sitting still from `stopAt` on: for how fast the state follows (BL4).
    mutating func danceThenStill(stopAt: TimeInterval = 40, duration: TimeInterval = 70) -> MotionCSV.Take {
        let dance = dancing(minutes: stopAt / 60 + 0.1).samples
        let rest = still(minutes: (duration - stopAt) / 60 + 0.1).samples
        let samples = dance.filter { $0.t < stopAt }
            + rest.map { var s = $0; s.t += stopAt; return s }.filter { $0.t <= duration }
        return MotionCSV.Take(meta: ["label": "mixed", "source": "synthetic"], samples: samples)
    }

    /// The full fixture set the work order asks for, from one person.
    static func fullSet(seed: UInt64 = 7) -> [(name: String, take: MotionCSV.Take)] {
        var g = SyntheticMotion(seed: seed)
        var out: [(String, MotionCSV.Take)] = []
        for i in 0..<10 { out.append(("synthetic_fall_\(i).csv", g.fall(variant: i))) }
        for i in 0..<10 { out.append(("synthetic_sitdown_\(i).csv", g.sitDown(variant: i))) }
        for i in 0..<10 { out.append(("synthetic_nod_\(i).csv", g.nod(variant: i))) }
        for i in 0..<6 { out.append(("synthetic_dancing_\(i).csv", g.dancing())) }
        out.append(("synthetic_walking_0.csv", g.walking()))
        return out
    }
}

struct SplitMix64 {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
    mutating func nextDouble() -> Double { Double(next() >> 11) / Double(1 << 53) }
}
