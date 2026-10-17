import Foundation

/// J5 replay harness: feeds recorded takes through `MotionPipeline` and scores them
/// against the J6/J7 bars. Used by the tests and by `motion-probe replay <dir>`.
public enum MotionReplay {
    public struct TakeResult: Sendable {
        public let name: String
        public let label: String
        public let duration: TimeInterval
        public let falls: [String]        // reason strings
        public let nods: Int              // with the nod detector listening the whole take
        /// BL4: share of the take, after its first 3 s, shown as its own activity. Nil for
        /// labels that aren't one state (falls, sit-downs, nods).
        public var stateShare: Double? = nil
    }

    /// The motion state a take of this label should show, for BL4's bar.
    static let expectedState: [String: MotionState] = ["dancing": .dancing, "walking": .walking, "still": .still]
    /// Seconds at the start of a take the classifier gets to settle before it's scored.
    static let stateSettle: TimeInterval = 3

    public struct ClassSummary: Sendable {
        public let label: String
        public let takes: Int
        public let duration: TimeInterval
        public let takesWithFall: Int
        public let totalFalls: Int
        public let takesWithNod: Int
        public let totalNods: Int
        /// Duration-weighted share in the expected state; nil when the label has none.
        public let stateShare: Double?
    }

    public struct Report: Sendable {
        public let takes: [TakeResult]
        public var summaries: [ClassSummary] {
            Dictionary(grouping: takes, by: \.label).keys.sorted().map { label in
                let ts = takes.filter { $0.label == label }
                return ClassSummary(label: label, takes: ts.count,
                                    duration: ts.map(\.duration).reduce(0, +),
                                    takesWithFall: ts.filter { !$0.falls.isEmpty }.count,
                                    totalFalls: ts.map(\.falls.count).reduce(0, +),
                                    takesWithNod: ts.filter { $0.nods > 0 }.count,
                                    totalNods: ts.map(\.nods).reduce(0, +),
                                    stateShare: Self.weightedShare(ts))
            }
        }

        private static func weightedShare(_ takes: [TakeResult]) -> Double? {
            let scored = takes.compactMap { t in t.stateShare.map { (share: $0, weight: max(t.duration, 1)) } }
            guard !scored.isEmpty else { return nil }
            let weight = scored.map(\.weight).reduce(0, +)
            return scored.map { $0.share * $0.weight }.reduce(0, +) / weight
        }
        public func summary(_ label: String) -> ClassSummary? { summaries.first { $0.label == label } }

        /// The pass bars from WORK_ORDER.md J6 and J7, for the classes that have takes.
        public var verdicts: [(bar: String, pass: Bool, detail: String)] {
            var out: [(String, Bool, String)] = []
            if let f = summary("fall") {
                let need = Int((Double(f.takes) * 0.8).rounded(.up))
                out.append(("falls detected ≥ 80%", f.takesWithFall >= need, "\(f.takesWithFall) of \(f.takes)"))
            }
            if let d = summary("dancing") {
                let allowed = max(1, d.duration / 1800)
                out.append(("≤ 1 fall per 30 min of dancing", Double(d.totalFalls) <= allowed.rounded(.down),
                            String(format: "%d in %.1f min", d.totalFalls, d.duration / 60)))
                out.append(("0 nods while dancing", d.totalNods == 0, "\(d.totalNods)"))
            }
            if let s = summary("sitdown") {
                out.append(("0 falls on sit-downs", s.totalFalls == 0, "\(s.totalFalls) in \(s.takes) takes"))
            }
            if let n = summary("nod") {
                let need = Int((Double(n.takes) * 0.9).rounded(.up))
                out.append(("nods detected ≥ 90%", n.takesWithNod >= need, "\(n.takesWithNod) of \(n.takes)"))
            }
            for label in MotionReplay.expectedState.keys.sorted() {
                guard let share = summary(label)?.stateShare else { continue }
                out.append(("\(label) shown as \(label) ≥ 90%", share >= 0.9, String(format: "%.0f%%", share * 100)))
            }
            return out
        }

        public var table: String {
            var lines = ["label     takes   minutes  falls(takes/total)  nods(takes/total)  state"]
            for s in summaries {
                let state = s.stateShare.map { String(format: "%.0f%%", $0 * 100) } ?? "—"
                let counts = String(format: " %5d %9.1f %10d/%-8d %9d/%-8d", s.takes, s.duration / 60,
                                    s.takesWithFall, s.totalFalls, s.takesWithNod, s.totalNods)
                lines.append(s.label.padding(toLength: 9, withPad: " ", startingAt: 0) + counts + " " + state)
            }
            lines.append("")
            for v in verdicts { lines.append("\(v.pass ? "PASS" : "FAIL")  \(v.bar): \(v.detail)") }
            return lines.joined(separator: "\n")
        }
    }

    public static func run(_ take: MotionCSV.Take, name: String, label: String) -> TakeResult {
        let pipeline = MotionPipeline()
        pipeline.listeningForNod = true
        var falls: [String] = []
        var nods = 0
        let expected = expectedState[label]
        let start = take.samples.first?.t ?? 0
        var scored = 0, matched = 0
        for s in take.samples {
            let out = pipeline.process(s)
            if let t = out.trigger { falls.append(t.reason) }
            if out.nod != nil { nods += 1 }
            if let expected, s.t - start >= stateSettle {
                scored += 1
                if pipeline.state == expected { matched += 1 }
            }
        }
        let duration = (take.samples.last?.t ?? 0) - start
        let share = expected != nil && scored > 0 ? Double(matched) / Double(scored) : nil
        return TakeResult(name: name, label: label, duration: duration, falls: falls, nods: nods,
                          stateShare: share)
    }

    /// Replays every `*.csv` in `directory`. Label comes from `# label=` or the filename.
    public static func run(directory: URL) throws -> Report {
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension.lowercased() == "csv" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        var results: [TakeResult] = []
        for file in files {
            let take = try MotionCSV.decode(String(contentsOf: file, encoding: .utf8))
            let label = take.label ?? MotionCSV.label(fromFilename: file.lastPathComponent) ?? "unlabelled"
            results.append(run(take, name: file.lastPathComponent, label: label))
        }
        return Report(takes: results)
    }
}
