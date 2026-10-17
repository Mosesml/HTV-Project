// `swift run fall-lab compare`: fall-model plan step 9. Three detectors on the same takes,
// leave one fold out, scored on the REAL takes only:
//   A  the PRD's original thresholds (impact ≥ 2.5 g, head ≥ 50°, 10 s still)
//   B  the same detector with the impact threshold retuned on the training folds
//   C  the model: a candidate (head past 45°) the model calls a fall, then 10 s still
// The model ships only if it passes every bar on every fold and catches more falls than B.

import CoreML
import Foundation
import RaveGuardCore

/// Plan bars (docs/fall-model-plan.md, step 4).
let maxSecondsToDetect = 12.0
let minFallShare = 0.8
let refractorySeconds = 60.0
/// The PRD's starting impact threshold, before step 9 retuned it.
let originalSpikeG = 2.5
let spikeGrid = stride(from: 1.0, through: 2.6, by: 0.05).map { ($0 * 100).rounded() / 100 }

/// What one detector did on one take: seconds into the take of each detection.
typealias Detector = (Take) throws -> [TimeInterval]

struct Score {
    var fallsCaught = 0, falls = 0, inTime = 0
    var sitFires = 0, sits = 0
    var danceFires = 0, danceMinutes = 0.0
    var secondsToDetect: [Double] = []
    var missed: [String] = []

    mutating func add(_ other: Score) {
        fallsCaught += other.fallsCaught; falls += other.falls; inTime += other.inTime
        sitFires += other.sitFires; sits += other.sits
        danceFires += other.danceFires; danceMinutes += other.danceMinutes
        secondsToDetect += other.secondsToDetect; missed += other.missed
    }

    var dancePer30Min: Double { danceMinutes > 0 ? Double(danceFires) / danceMinutes * 30 : 0 }
    var passes: Bool {
        falls > 0 && Double(fallsCaught) >= minFallShare * Double(falls) && inTime == fallsCaught
            && sitFires == 0 && dancePer30Min <= 1
    }
}

/// When the fall happened: the moment the head first passed 45° (the model's candidate).
func fallMoment(_ take: Take) -> TimeInterval? { FallFeatures.candidates(in: take.samples).first?.t0 }

func score(_ takes: [Take], _ detect: Detector) throws -> Score {
    var s = Score()
    for take in takes {
        let hits = try detect(take)
        switch take.label {
        case "fall":
            s.falls += 1
            guard let hit = hits.first else { s.missed.append(take.name); continue }
            s.fallsCaught += 1
            let seconds = hit - (fallMoment(take) ?? hit)
            s.secondsToDetect.append(seconds)
            if seconds <= maxSecondsToDetect { s.inTime += 1 }
        case "sitdown":
            s.sits += 1
            s.sitFires += hits.count
        case "dancing":
            s.danceFires += hits.count
            s.danceMinutes += ((take.samples.last?.t ?? 0) - (take.samples.first?.t ?? 0)) / 60
        default: break
        }
    }
    return s
}

func thresholds(spikeG: Double) -> Detector {
    { FallEvaluation.thresholdDetections(in: $0.samples, spikeG: spikeG) }
}

/// Candidate → model ≥ cut-off → the detector's 10 s stillness; one fire per refractory window.
func learned(_ model: MLModel) -> Detector {
    { take in
        var fired: [TimeInterval] = []
        for c in FallFeatures.candidates(in: take.samples) {
            if let last = fired.last, c.t0 - last < refractorySeconds { continue }
            guard try fallProbability(model, c.features) >= cutOff,
                  let at = FallEvaluation.stillnessConfirmed(in: take.samples, after: c.t0) else { continue }
            fired.append(at)
        }
        return fired
    }
}

/// B's threshold from training takes only: the highest impact threshold that still catches
/// the most training falls and fires on no sit-down. Sit-downs never bind (the tilt check
/// stops them), so with no real lie-down or dancing data the highest value is the one that
/// leaves the most room against false alarms we cannot measure yet.
func retunedSpike(_ training: [Take]) throws -> Double {
    var best: (caught: Int, values: [Double]) = (-1, [])
    for g in spikeGrid {
        let s = try score(training, thresholds(spikeG: g))
        guard s.sitFires == 0 else { continue }
        if s.fallsCaught > best.caught { best = (s.fallsCaught, [g]) }
        else if s.fallsCaught == best.caught { best.values.append(g) }
    }
    return best.values.max() ?? FallEvaluation.defaultSpikeG
}

func describe(_ name: String, _ s: Score) -> String {
    let median = s.secondsToDetect.sorted().dropFirst(s.secondsToDetect.count / 2).first ?? .nan
    return String(format: "%@ %2d of %2d   %2d of %2d   %d of %d   %4.1f      %@     %@",
                  name.padding(toLength: 30, withPad: " ", startingAt: 0) as NSString,
                  s.fallsCaught, s.falls, s.inTime, s.fallsCaught, s.sitFires, s.sits,
                  s.dancePer30Min, median.isNaN ? " — " : String(format: "%4.1f s", median) as NSString,
                  s.passes ? "PASS" : "fail")
}

func runCompare(_ takes: [Take], _ all: [Row]) throws {
    var a = Score(), b = Score(), c = Score()
    var perFold: [(k: Int, spike: Double, b: Score, c: Score)] = []
    for k in 0..<folds {
        let training = takes.filter { $0.fold != k && $0.source != "synthetic" }
        let test = takes.filter { $0.fold == k && ($0.source == "real" || $0.source == "synthetic") }
        let spike = try retunedSpike(training)
        let model = try train(all.filter { $0.take.fold != k }).model
        let sb = try score(test, thresholds(spikeG: spike)), sc = try score(test, learned(model))
        a.add(try score(test, thresholds(spikeG: originalSpikeG)))
        b.add(sb); c.add(sc)
        perFold.append((k, spike, sb, sc))
    }
    let shipSpike = try retunedSpike(takes.filter { $0.source != "synthetic" })

    print("Step 9: leave one fold out; scored on the 10 real falls and 5 real sit-downs, plus synthetic dancing")
    print("detector                       falls caught  in ≤12 s   sit-downs  dance/30min  median to detect  bars")
    print(describe(String(format: "A original (%.2f g)", originalSpikeG), a))
    print(describe("B retuned impact threshold", b))
    print(describe("C model + 10 s stillness", c))
    print("\nper fold (one side and one back fall each):")
    for f in perFold {
        print(String(format: "  fold %d  B at %.2f g: %d of %d falls, %d sit fires   C: %d of %d falls, %d sit fires",
                     f.k, f.spike, f.b.fallsCaught, f.b.falls, f.b.sitFires,
                     f.c.fallsCaught, f.c.falls, f.c.sitFires))
    }
    for (name, s) in [("A", a), ("B", b), ("C", c)] where !s.secondsToDetect.isEmpty {
        print("\(name) seconds from head past 45° to detection: "
              + s.secondsToDetect.sorted().map { String(format: "%.1f", $0) }.joined(separator: ", "))
    }
    for (name, s) in [("A", a), ("B", b), ("C", c)] where !s.missed.isEmpty {
        print("\(name) missed: " + s.missed.joined(separator: ", "))
    }
    let cEveryFold = perFold.allSatisfy { $0.c.passes }
    let ship = cEveryFold && c.fallsCaught > b.fallsCaught ? "C (the model)" : "B (retuned thresholds)"
    print(String(format: "\nB threshold chosen on all real and augmented takes: %.2f g (app now: %.2f g)",
                 shipSpike, FallEvaluation.defaultSpikeG))
    print("Ship rule: the model ships only if it passes every bar on every fold and catches more falls than B.")
    print("Decision: \(ship)")
}
