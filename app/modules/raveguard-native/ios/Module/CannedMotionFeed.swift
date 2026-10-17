import Foundation

/// `onMotion` readouts at 10 Hz for the screens and Debug panel, until J12 feeds
/// `HeadMotionStream.readouts` instead. A gentle head sway: pitch ±8°, roll ±4°, little
/// acceleration, state `still`. Runs on the session clock, so tests drive it without waiting.
@MainActor
final class CannedMotionFeed {
    static let interval: TimeInterval = 0.1

    var onReadout: ((MotionReadout) -> Void)?
    var isRunning: Bool { timer != nil }

    private let clock: SessionClock
    private var timer: SessionTimer?
    private var startedAt: Date?

    init(clock: SessionClock) { self.clock = clock }

    /// Sends one readout now, then one every `interval`.
    func start() {
        guard timer == nil else { return }
        startedAt = clock.now
        tick()
    }

    func stop() {
        timer?.cancel()
        timer = nil
        startedAt = nil
    }

    private func tick() {
        let now = clock.now
        let elapsed = now.timeIntervalSince(startedAt ?? now)
        timer = clock.schedule(after: Self.interval) { [weak self] in self?.tick() }
        onReadout?(Self.readout(elapsed: elapsed, at: now))
    }

    static func readout(elapsed: TimeInterval, at: Date) -> MotionReadout {
        let cycle = 2 * Double.pi * elapsed
        return MotionReadout(state: .still,
                             pitchDeg: 8 * sin(0.5 * cycle),
                             rollDeg: 4 * sin(0.25 * cycle),
                             accelG: 0.03 + 0.02 * abs(sin(cycle)),
                             at: at)
    }
}
