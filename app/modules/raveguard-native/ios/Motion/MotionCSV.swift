import Foundation

/// The recording format for `Motion/Fixtures/` (J4) and the replay harness (J5).
///
///     # label=fall
///     # person=justin
///     t,pitch,roll,yaw,rotX,rotY,rotZ,accX,accY,accZ,gravX,gravY,gravZ
///     0.000,0.0123,...
///
/// One take per file, named `<person>_<label>_<take>.csv`, e.g. `justin_fall_03.csv`.
/// `t` starts at 0 for each take.
public enum MotionCSV {
    public static let header = "t,pitch,roll,yaw,rotX,rotY,rotZ,accX,accY,accZ,gravX,gravY,gravZ"

    public struct Take: Equatable, Sendable {
        public var meta: [String: String]
        public var samples: [MotionSample]
        public var label: String? { meta["label"] }
        public init(meta: [String: String], samples: [MotionSample]) {
            self.meta = meta; self.samples = samples
        }
    }

    public enum ParseError: Error, Equatable {
        case missingHeader
        case badRow(line: Int, text: String)
    }

    public static func encode(_ take: Take) -> String {
        var out = ""
        for key in take.meta.keys.sorted() { out += "# \(key)=\(take.meta[key]!)\n" }
        out += header + "\n"
        let t0 = take.samples.first?.t ?? 0
        for s in take.samples { out += row(s, t0: t0) + "\n" }
        return out
    }

    public static func row(_ s: MotionSample, t0: TimeInterval = 0) -> String {
        let t = String(format: "%.4f", s.t - t0)
        let rest = [s.pitch, s.roll, s.yaw, s.rotX, s.rotY, s.rotZ,
                    s.accX, s.accY, s.accZ, s.gravX, s.gravY, s.gravZ]
            .map { String(format: "%.5f", $0) }
        return ([t] + rest).joined(separator: ",")
    }

    public static func decode(_ text: String) throws -> Take {
        var meta: [String: String] = [:]
        var samples: [MotionSample] = []
        var columns: [String]?
        for (i, raw) in text.split(whereSeparator: \.isNewline).enumerated() {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { continue }
            if line.hasPrefix("#") {
                let body = line.dropFirst().trimmingCharacters(in: .whitespaces)
                if let eq = body.firstIndex(of: "=") {
                    meta[String(body[..<eq]).trimmingCharacters(in: .whitespaces)] =
                        String(body[body.index(after: eq)...]).trimmingCharacters(in: .whitespaces)
                }
                continue
            }
            guard let cols = columns else {
                guard line.hasPrefix("t,") else { throw ParseError.missingHeader }
                columns = line.split(separator: ",").map(String.init)
                continue
            }
            let parts = line.split(separator: ",", omittingEmptySubsequences: false)
            guard parts.count == cols.count else { throw ParseError.badRow(line: i + 1, text: line) }
            var v: [String: Double] = [:]
            for (name, part) in zip(cols, parts) {
                guard let d = Double(part) else { throw ParseError.badRow(line: i + 1, text: line) }
                v[name] = d
            }
            samples.append(MotionSample(
                t: v["t"] ?? 0, pitch: v["pitch"] ?? 0, roll: v["roll"] ?? 0, yaw: v["yaw"] ?? 0,
                rotX: v["rotX"] ?? 0, rotY: v["rotY"] ?? 0, rotZ: v["rotZ"] ?? 0,
                accX: v["accX"] ?? 0, accY: v["accY"] ?? 0, accZ: v["accZ"] ?? 0,
                gravX: v["gravX"] ?? 0, gravY: v["gravY"] ?? 0, gravZ: v["gravZ"] ?? 0))
        }
        guard columns != nil else { throw ParseError.missingHeader }
        return Take(meta: meta, samples: samples)
    }

    /// Label from a fixture filename (`justin_fall_03.csv` → `fall`), used when the file
    /// has no `# label=` line.
    public static func label(fromFilename name: String) -> String? {
        let parts = (name as NSString).deletingPathExtension.split(separator: "_")
        return parts.count >= 2 ? String(parts[1]) : nil
    }
}
