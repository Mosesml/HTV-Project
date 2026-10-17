import Foundation
import Testing
@testable import RaveGuardCore

@Suite struct LearnedFallDetectorTests {
    static let couch = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("Motion/Fixtures/couch-baseline")

    /// Every fall trigger the app's pipeline emits for these samples.
    static func triggers(_ samples: [MotionSample], _ detector: FallDetecting) -> [MotionEvent] {
        let pipeline = MotionPipeline(fallDetector: detector)
        return samples.compactMap { pipeline.process($0).trigger }
    }

    static func take(_ name: String) throws -> [MotionSample] {
        try MotionCSV.decode(String(contentsOf: couch.appendingPathComponent(name), encoding: .utf8)).samples
    }

    static func modelDetector() throws -> LearnedFallDetector {
        let model = try #require(FallModel.shared, "the embedded model should load")
        return LearnedFallDetector(probability: model.probability)
    }

    @Test func theEmbeddedModelLoadsWithFallFeaturesInputs() throws {
        #expect(FallModelData.version != "none")
        let model = try #require(FallModel.shared)
        let p = try #require(model.probability(Array(repeating: 0, count: FallFeatures.names.count)))
        #expect((0...1).contains(p))
    }

    /// Plan step 10: the app's code path reproduces the replay (10 of 10 couch falls, 0 sit-downs).
    @Test func everyRealCouchFallFiresOnceAndNoSitDownDoes() throws {
        try #require(FileManager.default.fileExists(atPath: Self.couch.path), "couch recordings not present")
        for n in 1...10 {
            let fired = Self.triggers(try Self.take(String(format: "kean_fall_%02d.csv", n)), try Self.modelDetector())
            #expect(fired.count == 1, "kean_fall_\(n)")
            #expect(fired.first?.reason.hasPrefix("model ") == true, "kean_fall_\(n): \(fired.first?.reason ?? "none")")
        }
        for n in 1...5 {
            let fired = Self.triggers(try Self.take(String(format: "kean_sitdown_%02d.csv", n)), try Self.modelDetector())
            #expect(fired.isEmpty, "kean_sitdown_\(n)")
        }
    }

    @Test func fiveMinutesOfDancingNeverFires() throws {
        var g = SyntheticMotion(seed: 11)
        #expect(Self.triggers(g.dancing(minutes: 5).samples, try Self.modelDetector()).isEmpty)
    }

    @Test func aCandidateTheModelRejectsNeverFires() throws {
        try #require(FileManager.default.fileExists(atPath: Self.couch.path), "couch recordings not present")
        let fall = try Self.take("kean_fall_04.csv")
        #expect(Self.triggers(fall, LearnedFallDetector(probability: { _ in 0.1 })).isEmpty)
        #expect(Self.triggers(fall, LearnedFallDetector(probability: { _ in nil })).isEmpty)
    }

    @Test func theModelStillNeedsTenSecondsOfStillness() throws {
        try #require(FileManager.default.fileExists(atPath: Self.couch.path), "couch recordings not present")
        let fall = try Self.take("kean_fall_04.csv")
        let t0 = try #require(FallFeatures.candidates(in: fall).first).t0
        // Cut the recording 8 s after the head went down: the model says fall, but too soon.
        let short = fall.filter { $0.t < t0 + 8 }
        #expect(Self.triggers(short, LearnedFallDetector(probability: { _ in 0.99 })).isEmpty)
        let fired = Self.triggers(fall, LearnedFallDetector(probability: { _ in 0.99 }))
        #expect(fired.first?.reason.hasPrefix("model 0.99, head ") == true)
    }

    @Test func gettingBackUpCancelsTheCandidate() {
        // Head goes past 45° for 3 s, then back upright: never a fall, whatever the model says.
        var g = SyntheticMotion(seed: 5)
        let samples = g.take(label: "bend", duration: 20, angles: { t in
            let down = t > 4 && t < 7 ? 80.0 : 0.0
            return (0, down, 0)
        }, accel: { _ in 0.02 }).samples
        #expect(Self.triggers(samples, LearnedFallDetector(probability: { _ in 0.99 })).isEmpty)
    }

    @Test func theLiveDetectorUsesTheModelWhenItLoads() {
        #expect(LearnedFallDetector.live(config: .init()) != nil)
    }
}
