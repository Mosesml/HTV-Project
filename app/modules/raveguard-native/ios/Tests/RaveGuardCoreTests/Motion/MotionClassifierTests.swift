import Foundation
import Testing
@testable import RaveGuardCore

/// BL4 (PRD A9 / DET-5): dancing, walking and still from motion-energy bands, against the
/// wearer's own activity. Synthetic clips only, until the J4 recordings exist.
@Suite struct MotionClassifierTests {

    /// Share of the take, after its first `settle` seconds, spent in `expected`.
    private func share(_ take: MotionCSV.Take, _ expected: MotionState, settle: TimeInterval = 3) -> Double {
        var classifier = MotionClassifier()
        var inState = 0, counted = 0
        for s in take.samples {
            let state = classifier.process(s)
            guard s.t >= settle else { continue }
            counted += 1
            if state == expected { inState += 1 }
        }
        return Double(inState) / Double(max(1, counted))
    }

    @Test(arguments: [31, 32, 33] as [UInt64])
    func dancingIsDancing(seed: UInt64) {
        var g = SyntheticMotion(seed: seed)
        #expect(share(g.dancing(minutes: 2), .dancing) >= 0.9)
    }

    @Test(arguments: [41, 42, 43] as [UInt64])
    func walkingIsWalking(seed: UInt64) {
        var g = SyntheticMotion(seed: seed)
        #expect(share(g.walking(minutes: 2), .walking) >= 0.9)
    }

    @Test(arguments: [51, 52, 53] as [UInt64])
    func standingStillIsStill(seed: UInt64) {
        var g = SyntheticMotion(seed: seed)
        #expect(share(g.still(minutes: 1), .still) >= 0.9)
    }

    @Test func sittingDownEndsStill() {
        var g = SyntheticMotion(seed: 54)
        var classifier = MotionClassifier()
        var last: MotionState = .unknown
        for s in g.sitDown(variant: 0).samples { last = classifier.process(s) }
        #expect(last == .still)
    }

    @Test func unknownUntilTheWindowHasFilled() {
        var g = SyntheticMotion(seed: 55)
        var classifier = MotionClassifier()
        for s in g.dancing(minutes: 0.1).samples where s.t < 1 {
            #expect(classifier.process(s) == .unknown)
        }
    }

    /// A9's done-when: the state matches the activity within 3 s.
    @Test(arguments: [61, 62, 63] as [UInt64])
    func stopDancingShowsStillWithinThreeSeconds(seed: UInt64) throws {
        var g = SyntheticMotion(seed: seed)
        var classifier = MotionClassifier()
        var stillAt: TimeInterval?
        for s in g.danceThenStill(stopAt: 40).samples {
            let state = classifier.process(s)
            if s.t < 40 { continue }
            if state == .still, stillAt == nil { stillAt = s.t }
        }
        #expect(try #require(stillAt) - 40 <= 3)
    }

    @Test func startDancingShowsDancingWithinThreeSeconds() throws {
        var g = SyntheticMotion(seed: 64)
        let rest = g.still(minutes: 0.5).samples
        let dance = g.dancing(minutes: 0.5).samples.map { var s = $0; s.t += 30; return s }
        var classifier = MotionClassifier()
        var dancingAt: TimeInterval?
        for s in rest + dance {
            if classifier.process(s) == .dancing, s.t >= 30, dancingAt == nil { dancingAt = s.t }
        }
        #expect(try #require(dancingAt) - 30 <= 3)
    }

    /// No flicker: a single loud beat in a still minute doesn't change the state.
    @Test func aSingleBumpDoesNotFlicker() {
        var g = SyntheticMotion(seed: 65)
        var take = g.still(minutes: 0.5)
        for i in take.samples.indices where abs(take.samples[i].t - 15) < 0.1 {
            take.samples[i].accX += 0.6
        }
        var classifier = MotionClassifier()
        var states: [MotionState] = []
        var changes: [String] = []
        for s in take.samples {
            let state = classifier.process(s)
            guard s.t >= 3 else { continue }
            if states.last != state {
                states.append(state)
                changes.append(String(format: "%.2f %@", s.t, state.rawValue))
            }
        }
        #expect(states == [.still], "\(changes)")
    }

    // MARK: The wearer's own baseline (PRD A10: 20% of their active rotation)

    @Test func beforeLearningStillnessUsesTheAbsoluteCeiling() {
        let classifier = MotionClassifier()
        #expect(!classifier.baseline.isReady)
        #expect(classifier.stillRotationThreshold == MotionClassifierConfig().stillRotationCeiling)
    }

    @Test func aGentleWalkerGetsAStricterStillnessThreshold() {
        var g = SyntheticMotion(seed: 71)
        var classifier = MotionClassifier()
        for s in g.walking(minutes: 2).samples { _ = classifier.process(s) }
        #expect(classifier.baseline.isReady)
        let threshold = classifier.stillRotationThreshold
        #expect(threshold < MotionClassifierConfig().stillRotationCeiling)
        #expect(threshold >= MotionClassifierConfig().stillRotationFloor)
        #expect(abs(threshold - 0.2 * classifier.baseline.activeRotation) < 1e-9
                || threshold == MotionClassifierConfig().stillRotationFloor)
    }

    @Test func anEnergeticDancerKeepsTheCeiling() {
        var g = SyntheticMotion(seed: 72)
        var classifier = MotionClassifier()
        for s in g.dancing(minutes: 2).samples { _ = classifier.process(s) }
        #expect(classifier.baseline.isReady)
        #expect(classifier.stillRotationThreshold == MotionClassifierConfig().stillRotationCeiling)
    }

    /// Fidgeting (head turning, no steps) is still for a dancer, not for a gentle walker.
    @Test func fidgetingIsJudgedAgainstTheWearer() {
        func fidget(_ g: inout SyntheticMotion) -> MotionCSV.Take {
            g.take(label: "fidget", duration: 20, angles: { t in
                (0, 0, 8 * sin(2 * .pi * 0.35 * t))
            }, accel: { _ in 0.03 })
        }
        var g = SyntheticMotion(seed: 73)
        var walker = MotionClassifier()
        for s in g.walking(minutes: 2).samples { _ = walker.process(s) }
        var dancer = MotionClassifier()
        for s in g.dancing(minutes: 2).samples { _ = dancer.process(s) }

        let clip = fidget(&g).samples
        let start = 2 * 60 + 1.0
        var walkerLast: MotionState = .unknown, dancerLast: MotionState = .unknown
        for s in clip {
            var shifted = s
            shifted.t += start
            walkerLast = walker.process(shifted)
            dancerLast = dancer.process(shifted)
        }
        #expect(dancerLast == .still)
        #expect(walkerLast != .still)
    }

    @Test func theBaselineStopsLearningAfterFifteenMinutes() {
        var config = MotionClassifierConfig()
        config.baselineLearnFor = 60
        var g = SyntheticMotion(seed: 74)
        var classifier = MotionClassifier(config: config)
        for s in g.walking(minutes: 1.5).samples { _ = classifier.process(s) }
        let learned = classifier.baseline.activeRotation
        let dance = g.dancing(minutes: 1).samples.map { var s = $0; s.t += 95; return s }
        for s in dance { _ = classifier.process(s) }
        #expect(classifier.baseline.activeRotation == learned)
    }
}
