import Foundation

/// J4 recorder, Swift side: buffers head-motion samples between `start` and `stop` and
/// writes one labelled CSV per take, ready for the share sheet (AirDrop to a Mac, then
/// into `Motion/Fixtures/`). The Recorder screen with its label picker lives in React
/// Native and drives this through the module.
final class MotionRecorder: @unchecked Sendable {
    static let labels = ["dancing", "walking", "sitdown", "fall", "nod"]

    private let lock = NSLock()
    private var current: (label: String, person: String, samples: [MotionSample])?
    private var takeCounts: [String: Int] = [:]
    private let directory: URL

    init(directory: URL = FileManager.default.temporaryDirectory.appendingPathComponent("RaveGuardTakes")) {
        self.directory = directory
    }

    var isRecording: Bool { lock.lock(); defer { lock.unlock() }; return current != nil }
    var sampleCount: Int { lock.lock(); defer { lock.unlock() }; return current?.samples.count ?? 0 }

    func start(label: String, person: String) {
        lock.lock()
        current = (label, Self.slug(person), [])
        lock.unlock()
    }

    func add(_ sample: MotionSample) {
        lock.lock()
        current?.samples.append(sample)
        lock.unlock()
    }

    /// Writes the take and returns its file, e.g. `justin_fall_03.csv`; nil if nothing
    /// was recorded.
    @discardableResult
    func stop() throws -> URL? {
        lock.lock()
        guard let take = current else { lock.unlock(); return nil }
        current = nil
        let key = "\(take.person)_\(take.label)"
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var n = takeCounts[key] ?? 0
        var url: URL
        repeat {
            n += 1
            url = directory.appendingPathComponent(String(format: "%@_%02d.csv", key, n))
        } while FileManager.default.fileExists(atPath: url.path)
        takeCounts[key] = n
        lock.unlock()

        guard !take.samples.isEmpty else { return nil }
        let csv = MotionCSV.encode(.init(meta: ["label": take.label, "person": take.person],
                                         samples: take.samples))
        try csv.write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    static func slug(_ s: String) -> String {
        let cleaned = s.lowercased().map { $0.isLetter || $0.isNumber ? $0 : "-" }
        return String(cleaned).trimmingCharacters(in: CharacterSet(charactersIn: "-")).isEmpty
            ? "anon" : String(cleaned).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }
}
