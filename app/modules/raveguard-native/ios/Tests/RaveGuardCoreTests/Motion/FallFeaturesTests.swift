import Foundation
import Testing
@testable import RaveGuardCore

@Suite struct FallFeaturesTests {
    @Test(arguments: 0..<6)
    func aFallGivesExactlyOneCandidateAtTheTilt(variant: Int) {
        var g = SyntheticMotion(seed: UInt64(10 + variant))
        let samples = g.fall(variant: variant).samples
        let found = FallFeatures.candidates(in: samples)
        #expect(found.count == 1)
        #expect(found.first.map { $0.features.count } == FallFeatures.names.count)
        #expect(found.allSatisfy { $0.features.allSatisfy(\.isFinite) })
    }

    @Test(arguments: 0..<6)
    func aSitDownGivesNoCandidate(variant: Int) {
        var g = SyntheticMotion(seed: UInt64(20 + variant))
        #expect(FallFeatures.candidates(in: g.sitDown(variant: variant).samples).isEmpty)
    }

    @Test func fallFeaturesLookLikeAFall() throws {
        var g = SyntheticMotion(seed: 3)
        let c = try #require(FallFeatures.candidates(in: g.fall(variant: 0).samples).first)
        let f = Dictionary(uniqueKeysWithValues: zip(FallFeatures.names, c.features))
        #expect(f["peakAccel"]! > 2)
        #expect(f["tiltAfter"]! > 50)
        #expect(f["tiltSeconds15to45"]! < 1)
        #expect(f["rotationAfter"]! < 0.35)
    }

    @Test func noCandidateWithoutTwoSecondsBeforeAndThreeAfter() {
        var g = SyntheticMotion(seed: 4)
        let samples = g.fall(variant: 0).samples
        let t0 = FallFeatures.candidates(in: samples)[0].t0
        #expect(FallFeatures.candidates(in: samples.filter { $0.t < t0 + 2 }).isEmpty)
    }

    @Test func aRealCouchFallGivesOneCandidate() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Motion/Fixtures/couch-baseline/kean_fall_04.csv")
        try #require(FileManager.default.fileExists(atPath: url.path), "couch recordings not present")
        let take = try MotionCSV.decode(String(contentsOf: url, encoding: .utf8))
        let found = FallFeatures.candidates(in: take.samples)
        #expect(found.count == 1)
        #expect(abs((found.first?.t0 ?? 0) - 3.66) < 0.2)
    }
}
