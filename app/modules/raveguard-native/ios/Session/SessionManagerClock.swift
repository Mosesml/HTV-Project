import Foundation

/// Time source plus one-shot timers, injected into `SessionManager` so tests can drive
/// the ladder without waiting. All callbacks run on the main actor.
@MainActor
protocol SessionClock: AnyObject {
    var now: Date { get }
    @discardableResult
    func schedule(after delay: TimeInterval, _ fire: @escaping @MainActor () -> Void) -> SessionTimer
}

@MainActor
protocol SessionTimer: AnyObject { func cancel() }

/// Wall clock backed by main-queue timers. With the audio background mode held, the app
/// keeps running while locked, so these keep firing (verified by J2 on a device).
@MainActor
final class SystemSessionClock: SessionClock {
    var now: Date { Date() }

    func schedule(after delay: TimeInterval, _ fire: @escaping @MainActor () -> Void) -> SessionTimer {
        let timer = DispatchTimerBox()
        let item = DispatchWorkItem { [weak timer] in
            guard let timer, !timer.cancelled else { return }
            MainActor.assumeIsolated { fire() }
        }
        timer.item = item
        DispatchQueue.main.asyncAfter(deadline: .now() + max(0, delay), execute: item)
        return timer
    }

    private final class DispatchTimerBox: SessionTimer {
        var item: DispatchWorkItem?
        var cancelled = false
        func cancel() { cancelled = true; item?.cancel() }
    }
}

/// Deterministic clock for tests: time only moves when `advance` is called, and timers
/// fire in deadline order (ties in scheduling order).
@MainActor
final class ManualSessionClock: SessionClock {
    private(set) var now: Date
    private var timers: [Entry] = []
    private var seq = 0

    init(start: Date = Date(timeIntervalSince1970: 1_800_000_000)) { now = start }

    func schedule(after delay: TimeInterval, _ fire: @escaping @MainActor () -> Void) -> SessionTimer {
        seq += 1
        let entry = Entry(due: now.addingTimeInterval(max(0, delay)), seq: seq, fire: fire)
        timers.append(entry)
        return entry
    }

    var pendingTimerCount: Int { timers.filter { !$0.cancelled }.count }

    /// Moves time forward, firing every timer that falls due on the way, including
    /// timers scheduled by other timers inside the window.
    func advance(by seconds: TimeInterval) {
        let end = now.addingTimeInterval(seconds)
        while let next = timers.filter({ !$0.cancelled && $0.due <= end })
                               .min(by: { ($0.due, $0.seq) < ($1.due, $1.seq) }) {
            now = max(now, next.due)
            next.cancelled = true
            timers.removeAll { $0.cancelled }
            next.fire()
        }
        now = end
    }

    final class Entry: SessionTimer {
        let due: Date; let seq: Int; let fire: @MainActor () -> Void
        var cancelled = false
        init(due: Date, seq: Int, fire: @escaping @MainActor () -> Void) {
            self.due = due; self.seq = seq; self.fire = fire
        }
        func cancel() { cancelled = true }
    }
}
