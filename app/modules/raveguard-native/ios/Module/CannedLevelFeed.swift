import Foundation

/// Room loudness for demo mode (BL1), until the phone mic meter lands: a bar at about 74 dB
/// ramping to a club at 108 dB over a minute, then ±3 dB with the beat. Runs on the session
/// clock, so tests drive it without waiting. The first reading comes one interval after
/// `start()`, as a meter needs a full interval of audio first.
@MainActor
final class CannedLevelFeed: LevelSource {
    var onReading: ((Double) -> Void)?
    var isRunning: Bool { timer != nil }

    private let clock: SessionClock
    private let interval: TimeInterval
    private var timer: SessionTimer?
    private var startedAt: Date?

    init(clock: SessionClock, interval: TimeInterval) {
        self.clock = clock
        self.interval = interval
    }

    func start() {
        guard timer == nil else { return }
        startedAt = clock.now
        schedule()
    }

    func stop() {
        timer?.cancel()
        timer = nil
        startedAt = nil
    }

    private func schedule() {
        timer = clock.schedule(after: interval) { [weak self] in self?.tick() }
    }

    private func tick() {
        let elapsed = clock.now.timeIntervalSince(startedAt ?? clock.now)
        schedule()
        onReading?(Self.roomDb(elapsed: elapsed))
    }

    nonisolated static func roomDb(elapsed: TimeInterval) -> Double {
        let rampSeconds: TimeInterval = 60
        guard elapsed >= rampSeconds else { return 74 + 34 * elapsed / rampSeconds }
        return 108 + 3 * sin(elapsed * 2.1)
    }
}
