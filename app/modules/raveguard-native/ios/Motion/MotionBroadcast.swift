import Foundation

/// Fans one producer out to any number of `AsyncStream` consumers. `AsyncStream` itself
/// supports a single consumer, so every read of a `MotionEventSource` stream property
/// gets a fresh stream from here. Thread-safe; values sent before a stream was made are
/// not replayed, except the latest one when `replayLatest` is set.
final class MotionBroadcast<Value: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var continuations: [UUID: AsyncStream<Value>.Continuation] = [:]
    private var latest: Value?
    private let replayLatest: Bool

    init(replayLatest: Bool = false) { self.replayLatest = replayLatest }

    func stream() -> AsyncStream<Value> {
        AsyncStream { continuation in
            let id = UUID()
            lock.lock()
            continuations[id] = continuation
            let replay = replayLatest ? latest : nil
            lock.unlock()
            if let replay { continuation.yield(replay) }
            continuation.onTermination = { [weak self] _ in
                guard let self else { return }
                self.lock.lock(); self.continuations[id] = nil; self.lock.unlock()
            }
        }
    }

    func send(_ value: Value) {
        lock.lock()
        latest = value
        let targets = Array(continuations.values)
        lock.unlock()
        targets.forEach { $0.yield(value) }
    }

    var subscriberCount: Int { lock.lock(); defer { lock.unlock() }; return continuations.count }
}
