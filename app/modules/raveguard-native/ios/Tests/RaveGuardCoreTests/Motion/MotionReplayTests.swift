import Foundation
import Testing
@testable import RaveGuardCore

/// J5: replays recorded takes through the detectors and prints detections per class.
@Suite struct MotionReplayTests {

    static let fixtures = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("Motion/Fixtures")

    /// The real bar. Passes trivially (and says so) until recordings land in Fixtures/.
    @Test func recordedFixturesMeetTheJ6AndJ7Bars() throws {
        let report = try MotionReplay.run(directory: Self.fixtures)
        guard !report.takes.isEmpty else {
            print("[replay] No recordings in Motion/Fixtures yet; J6/J7 are not verified on real data.")
            return
        }
        print("[replay] Motion/Fixtures\n" + report.table)
        for v in report.verdicts { #expect(v.pass, "\(v.bar): \(v.detail)") }
    }

    /// The harness end to end on synthetic takes written to disk as CSV, so the parse,
    /// replay and scoring paths are all exercised now.
    @Test func harnessScoresSyntheticTakesFromDisk() throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("rg-replay-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        for (name, take) in SyntheticMotion.fullSet() {
            try MotionCSV.encode(take).write(to: dir.appendingPathComponent(name), atomically: true, encoding: .utf8)
        }
        let report = try MotionReplay.run(directory: dir)
        print("[replay] synthetic\n" + report.table)
        #expect(report.takes.count == 37)
        #expect(report.summary("fall")?.takesWithFall == 10)
        #expect(report.summary("sitdown")?.totalFalls == 0)
        #expect(report.summary("nod")?.takesWithNod == 10)
        #expect(report.summary("dancing")?.totalFalls == 0)
        #expect(report.summary("dancing")?.totalNods == 0)
        #expect(report.summary("walking")?.totalFalls == 0)
        for v in report.verdicts { #expect(v.pass, "\(v.bar): \(v.detail)") }
    }

    @Test func verdictsFailWhenTheBarIsMissed() {
        let missed = MotionReplay.Report(takes: (0..<10).map {
            .init(name: "f\($0)", label: "fall", duration: 20, falls: $0 < 7 ? ["x"] : [], nods: 0)
        } + [.init(name: "d", label: "dancing", duration: 600, falls: ["x"], nods: 1)])
        let byBar = Dictionary(uniqueKeysWithValues: missed.verdicts.map { ($0.bar, $0.pass) })
        #expect(byBar["falls detected ≥ 80%"] == false)        // 7 of 10
        #expect(byBar["≤ 1 fall per 30 min of dancing"] == true) // 1 in 10 min is allowed
        #expect(byBar["0 nods while dancing"] == false)
    }
}

@Suite struct MotionCSVTests {

    @Test func roundTrips() throws {
        var g = SyntheticMotion(seed: 31)
        let take = g.nod(variant: 1)
        let decoded = try MotionCSV.decode(MotionCSV.encode(take))
        #expect(decoded.label == "nod")
        #expect(decoded.samples.count == take.samples.count)
        for (a, b) in zip(decoded.samples, take.samples) {
            #expect(abs(a.t - b.t) < 1e-4)
            #expect(abs(a.pitch - b.pitch) < 1e-5)
            #expect(abs(a.accZ - b.accZ) < 1e-5)
        }
    }

    @Test func rejectsBadInput() {
        #expect(throws: MotionCSV.ParseError.missingHeader) { try MotionCSV.decode("1,2,3\n") }
        #expect(throws: MotionCSV.ParseError.self) { try MotionCSV.decode("\(MotionCSV.header)\n0,1\n") }
    }

    @Test func toleratesMissingGravityColumns() throws {
        let text = "t,pitch,roll,yaw,rotX,rotY,rotZ,accX,accY,accZ\n0,0.1,0,0,0,0,0,0,0,0\n"
        let take = try MotionCSV.decode(text)
        #expect(take.samples.first?.hasGravity == false)
    }

    @Test func labelFromFilename() {
        #expect(MotionCSV.label(fromFilename: "justin_fall_03.csv") == "fall")
        #expect(MotionCSV.label(fromFilename: "x.csv") == nil)
    }
}
