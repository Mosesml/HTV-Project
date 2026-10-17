import Foundation
import Testing
@testable import RaveGuardCore

/// J6 / J7 unit behaviour on synthetic clips. The real pass bars run in
/// `MotionReplayTests` against `Motion/Fixtures/`.
@Suite struct FallDetectorTests {

    private func falls(in take: MotionCSV.Take) -> [MotionEvent] {
        let p = MotionPipeline()
        return take.samples.compactMap { p.process($0).trigger }
    }

    @Test func detectsASidewaysFallWithAReadableReason() throws {
        var g = SyntheticMotion(seed: 1)
        let events = falls(in: g.fall(variant: 0))
        #expect(events.count == 1)
        let e = try #require(events.first)
        #expect(e.kind == .fall)
        // "spike 3.4 g, head 72° sideways, still 10 s"
        #expect(e.reason.contains(try Regex(#"^spike \d\.\d g, head \d+° sideways, still 1\d s$"#)))
        #expect(abs(e.posture?.rollDeg ?? 0) > 50)
    }

    @Test func detectsAForwardFall() throws {
        var g = SyntheticMotion(seed: 2)
        let e = try #require(falls(in: g.fall(variant: 2)).first)
        #expect(e.reason.contains("forward"))
    }

    @Test func spikeWithoutTiltIsNotAFall() {
        var g = SyntheticMotion(seed: 3)
        #expect(falls(in: g.sitDown(variant: 3)).isEmpty)   // the 2.8 g hard sit
    }

    @Test func tiltWithoutSpikeIsNotAFall() {
        var g = SyntheticMotion(seed: 4)
        // Lying down gently: head to 80° with no impact.
        let take = g.take(label: "liedown", duration: 30, angles: { t in
            (0, 80 * SyntheticMotion.smoothstep(t, from: 3, to: 6), 0)
        }, accel: { _ in 0.02 })
        #expect(falls(in: take).isEmpty)
    }

    @Test func gettingUpBeforeTenSecondsCancels() {
        var g = SyntheticMotion(seed: 5)
        let take = g.take(label: "fall-recover", duration: 30, angles: { t in
            let down = SyntheticMotion.smoothstep(t, from: 3, to: 3.6)
            let up = SyntheticMotion.smoothstep(t, from: 9, to: 10)
            return (0, 75 * down * (1 - up), 0)
        }, accel: { t in 0.02 + 3.5 * SyntheticMotion.bump(t, at: 3.5, width: 0.05) })
        #expect(falls(in: take).isEmpty)
    }

    @Test func movingWhileDownResetsTheStillnessCount() {
        var g = SyntheticMotion(seed: 6)
        let take = g.fall(variant: 4)   // twitches 7 s after landing
        let p = MotionPipeline()
        var firedAt: TimeInterval?
        for s in take.samples where firedAt == nil { if p.process(s).trigger != nil { firedAt = s.t } }
        let fallAt = take.samples.first { $0.accelG > 2.5 }!.t
        // Without the twitch it would fire ~11 s after impact; with it, after the twitch + 10 s.
        #expect(firedAt.map { $0 - fallAt > 16 } == true)
    }

    @Test func onlyOneTriggerPerFall() {
        var g = SyntheticMotion(seed: 8)
        var take = g.fall(variant: 1)
        let tail = take.samples.last!
        for i in 1...(50 * 40) {   // lie there another 40 s
            var s = tail; s.t += Double(i) / 50; take.samples.append(s)
        }
        #expect(falls(in: take).count == 1)
    }
}

@Suite struct NodDetectorTests {

    private func nods(in take: MotionCSV.Take, listening: Bool = true) -> Int {
        let p = MotionPipeline()
        p.listeningForNod = listening
        return take.samples.filter { p.process($0).nod != nil }.count
    }

    @Test func detectsADoubleNod() {
        var g = SyntheticMotion(seed: 11)
        #expect(nods(in: g.nod(variant: 1)) == 1)
    }

    @Test func tripleNodIsStillOneNod() {
        var g = SyntheticMotion(seed: 12)
        #expect(nods(in: g.nod(variant: 0)) == 1)
    }

    @Test func ignoredWhenNotListening() {
        var g = SyntheticMotion(seed: 13)
        #expect(nods(in: g.nod(variant: 1), listening: false) == 0)
    }

    @Test func singleDipIsNotANod() {
        var g = SyntheticMotion(seed: 14)
        // Look down once and stay there: one swing, no second reversal.
        let take = g.take(label: "lookdown", duration: 5, angles: { t in
            (-20 * SyntheticMotion.smoothstep(t, from: 1, to: 1.4), 0, 0)
        }, accel: { _ in 0.05 })
        #expect(nods(in: take) == 0)
    }

    @Test func smallWobblesAreNotANod() {
        var g = SyntheticMotion(seed: 15)
        let take = g.take(label: "wobble", duration: 6, angles: { t in
            (-8 * sin(2 * .pi * 2 * t), 0, 0)   // 16° peak to peak, but after smoothing < 12° swings
        }, accel: { _ in 0.05 })
        #expect(nods(in: take) == 0)
    }

    @Test func slowNodOutsideTwoSecondsIsNotANod() {
        var g = SyntheticMotion(seed: 16)
        let take = g.take(label: "slow", duration: 10, angles: { t in
            (-10 * (1 - cos(2 * .pi * 0.3 * t)), 0, 0)   // one cycle every 3.3 s
        }, accel: { _ in 0.05 })
        #expect(nods(in: take) == 0)
    }

    @Test func headBobbingWhileDancingIsNotANod() {
        var g = SyntheticMotion(seed: 17)
        #expect(nods(in: g.dancing(minutes: 2)) == 0)
    }

    @Test func listeningAgainStartsFresh() {
        // One dip during the first prompt, listening drops for 0.2 s, one dip after.
        // Each dip is a single reversal; only carried-over state would make it a nod.
        var g = SyntheticMotion(seed: 18)
        func dip(_ t: Double, at start: Double) -> Double {
            let x = t - start
            return x >= 0 && x <= 1 / 1.5 ? -10 * (1 - cos(2 * .pi * 1.5 * x)) : 0
        }
        let take = g.take(label: "split", duration: 3, angles: { t in
            (dip(t, at: 0.1) + dip(t, at: 1.3), 0, 0)
        }, accel: { _ in 0.05 })
        let p = MotionPipeline()
        var count = 0
        for s in take.samples {
            p.listeningForNod = !(s.t >= 1.0 && s.t < 1.2)
            if p.process(s).nod != nil { count += 1 }
        }
        #expect(count == 0)
        // Same motion listened to without the gap is a nod (top-of-head reversal links them).
        let q = MotionPipeline()
        q.listeningForNod = true
        #expect(take.samples.filter { q.process($0).nod != nil }.count == 1)
    }
}

@Suite struct MotionPipelineTests {

    @Test func readoutIsTenHertzFromFiftyHertzInput() {
        var g = SyntheticMotion(seed: 21)
        let take = g.walking(minutes: 1)
        let p = MotionPipeline()
        let readouts = take.samples.compactMap { p.process($0).readout }
        let seconds = take.samples.last!.t
        #expect(abs(Double(readouts.count) / seconds - 10) < 0.3)
    }

    @Test func readoutCarriesDegreesAndG() throws {
        let p = MotionPipeline()
        let s = MotionSample(t: 0, pitch: .pi / 6, roll: -.pi / 4, yaw: 0, rotX: 0, rotY: 0, rotZ: 0,
                             accX: 0.3, accY: 0.4, accZ: 0)
        let r = try #require(p.process(s).readout)
        #expect(abs(r.pitchDeg - 30) < 1e-9)
        #expect(abs(r.rollDeg + 45) < 1e-9)
        #expect(abs(r.accelG - 0.5) < 1e-9)
        #expect(r.modulePayload["state"] as? String == "unknown")
    }

    @Test func stateGoesFallenAfterAFall() {
        var g = SyntheticMotion(seed: 22)
        let p = MotionPipeline()
        var states: [MotionState] = []
        for s in g.fall(variant: 0).samples { if let st = p.process(s).state { states.append(st) } }
        #expect(states.last == .fallen)
    }

    @Test func dancingIsClassifiedAsDancing() {
        var g = SyntheticMotion(seed: 23)
        let p = MotionPipeline()
        var last: MotionState = .unknown
        for s in g.dancing(minutes: 0.5).samples { if let st = p.process(s).state { last = st } }
        #expect(last == .dancing)
    }

    /// Each session learns the wearer afresh and reports its state again (review item 2).
    @Test func resetForNewSessionForgetsTheStateAndTheBaseline() {
        var g = SyntheticMotion(seed: 25)
        let p = MotionPipeline()
        for s in g.walking(minutes: 2).samples { _ = p.process(s) }
        #expect(p.classifier.baseline.isReady)
        p.resetForNewSession()
        #expect(p.state == .unknown)
        #expect(!p.classifier.baseline.isReady)
        var states: [MotionState] = []
        for s in g.still(minutes: 0.2).samples.map({ var s = $0; s.t += 200; return s }) {
            if let st = p.process(s).state { states.append(st) }
        }
        #expect(states == [.still])
    }

    @Test func worksWithoutGravityColumns() {
        var g = SyntheticMotion(seed: 24)
        var take = g.fall(variant: 0)
        for i in take.samples.indices { take.samples[i].gravX = 0; take.samples[i].gravY = 0; take.samples[i].gravZ = 0 }
        let p = MotionPipeline()
        #expect(take.samples.compactMap { p.process($0).trigger }.count == 1)
    }
}
