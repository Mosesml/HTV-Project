import Foundation

/// SES-5 / A11: the on-device session log. Every trigger, check-in, cancel, PIN result and
/// escalation lands here as one JSON object per line, appended to a file in Application
/// Support. It never leaves the phone: nothing uploads it, it is excluded from iCloud
/// backup, and only `BriefFactsBuilder`'s derived `BriefFacts` reach the server. It is
/// also the only place a duress PIN is recorded.
///
/// Survives relaunches (the file is read back on init) and crashes (a half-written last
/// line is skipped). Writes keep working while the phone is locked, since a session runs
/// with the screen off. Old events are compacted away past `maxEvents`, so the file stays
/// small across many nights.
final class SessionLog: SessionLogging, @unchecked Sendable {
    let fileURL: URL
    let maxEvents: Int
    private let lock = NSLock()
    private var cache: [SessionEvent] = []
    /// The last write failure, if any. A failed write keeps the event in memory, so the
    /// running session still has it; it is lost only if the app is killed before a later
    /// compaction rewrites the file.
    private(set) var lastError: Error?

    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(isoFormatter.string(from: date))
        }
        return e
    }()

    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            guard let date = isoFormatter.date(from: text) else {
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath,
                                                        debugDescription: "bad date \(text)"))
            }
            return date
        }
        return d
    }()

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// `Application Support/RaveGuard/session-log.jsonl`.
    static func standard(fileManager: FileManager = .default) throws -> SessionLog {
        let support = try fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                          appropriateFor: nil, create: true)
        return SessionLog(fileURL: support.appendingPathComponent("RaveGuard/session-log.jsonl"))
    }

    init(fileURL: URL, maxEvents: Int = 5000) {
        self.fileURL = fileURL
        self.maxEvents = maxEvents
        prepareDirectory()
        cache = Self.read(fileURL)
        terminateDanglingLine()
        if cache.count > maxEvents { compact() }
    }

    var events: [SessionEvent] { lock.lock(); defer { lock.unlock() }; return cache }

    func append(_ e: SessionEvent) {
        lock.lock(); defer { lock.unlock() }
        cache.append(e)
        do {
            var line = try Self.encoder.encode(e)
            line.append(0x0A)
            try appendToFile(line)
            lastError = nil
        } catch {
            lastError = error
        }
        // Compact in batches so a long night doesn't rewrite the file on every event.
        if cache.count > maxEvents + max(100, maxEvents / 5) { compact() }
    }

    /// Deletes every event, on the device and in memory.
    func clear() {
        lock.lock(); defer { lock.unlock() }
        cache = []
        try? FileManager.default.removeItem(at: fileURL)
    }

    // MARK: File

    private func prepareDirectory() {
        let dir = fileURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableDir = dir
        try? mutableDir.setResourceValues(values)
    }

    /// A crash mid-write can leave a last line with no newline; end it, or the next event
    /// would be glued onto it and lost with it.
    private func terminateDanglingLine() {
        guard let handle = try? FileHandle(forUpdating: fileURL) else { return }
        defer { try? handle.close() }
        guard let size = try? handle.seekToEnd(), size > 0 else { return }
        try? handle.seek(toOffset: size - 1)
        if let last = try? handle.read(upToCount: 1), last != Data([0x0A]) {
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: Data([0x0A]))
        }
    }

    private func appendToFile(_ data: Data) throws {
        let fm = FileManager.default
        if !fm.fileExists(atPath: fileURL.path) {
            guard fm.createFile(atPath: fileURL.path, contents: nil, attributes: Self.fileAttributes) else {
                throw CocoaError(.fileWriteUnknown, userInfo: [NSFilePathErrorKey: fileURL.path])
            }
        }
        let handle = try FileHandle(forWritingTo: fileURL)
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: data)
    }

    /// Keeps the newest `maxEvents`, rewriting the file atomically. Caller holds the lock
    /// (or is `init`).
    private func compact() {
        cache = Array(cache.suffix(maxEvents))
        var data = Data()
        for e in cache {
            guard let line = try? Self.encoder.encode(e) else { continue }
            data.append(line); data.append(0x0A)
        }
        do {
            try data.write(to: fileURL, options: [.atomic])
            try? FileManager.default.setAttributes(Self.fileAttributes, ofItemAtPath: fileURL.path)
        } catch {
            lastError = error
        }
    }

    /// Readable once the phone has been unlocked after boot, so writes still work when it
    /// locks again mid-session.
    private static var fileAttributes: [FileAttributeKey: Any] {
        #if os(iOS)
        return [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
        #else
        return [:]
        #endif
    }

    private static func read(_ url: URL) -> [SessionEvent] {
        guard let data = try? Data(contentsOf: url) else { return [] }
        return data.split(separator: 0x0A).compactMap { try? decoder.decode(SessionEvent.self, from: Data($0)) }
    }
}
