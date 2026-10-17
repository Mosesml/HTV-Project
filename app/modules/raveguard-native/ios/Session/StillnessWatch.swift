import Foundation

/// BL3 (PRD A10 / DET-3): calls `onStill` once the wearer has been `still` for `duration`
/// while monitoring. What counts as still is the classifier's, against the wearer's own
/// baseline (BL4). After it fires it waits for walking or dancing before it can fire
/// again, so sitting at the bar doesn't bring a check-in every two minutes. A `fallen`
/// wearer is never "still": the fall detector has that.
@MainActor
final class StillnessWatch {
    var onStill: ((TimeInterval) -> Void)?

    private let clock: SessionClock
    private var state: MotionState = .unknown
    private var armed = true
    private var monitoring = false
    private var timer: SessionTimer?
    private var duration: () -> TimeInterval

    /// - Parameter duration: read when a countdown starts, so new settings apply to the next one.
    init(clock: SessionClock, duration: @escaping () -> TimeInterval) {
        self.clock = clock
        self.duration = duration
    }

    var isCountingDown: Bool { timer != nil }

    func stateChanged(_ newState: MotionState) {
        state = newState
        if newState == .walking || newState == .dancing { armed = true }
        restartCountdown()
    }

    /// Monitoring again, after start or a check-in: a full countdown from now.
    func resume() {
        monitoring = true
        restartCountdown()
    }

    /// A check-in is open; the countdown starts over once it's done.
    func pause() {
        monitoring = false
        cancel()
    }

    /// The session ended: forget the state and re-arm.
    func reset() {
        pause()
        state = .unknown
        armed = true
    }

    private func restartCountdown() {
        cancel()
        guard monitoring, armed, state == .still else { return }
        let seconds = duration()
        timer = clock.schedule(after: seconds) { [weak self] in
            guard let self else { return }
            self.timer = nil
            self.armed = false
            self.onStill?(seconds)
        }
    }

    private func cancel() {
        timer?.cancel()
        timer = nil
    }

    /// "still for 2 min", "still for 30 s".
    static func reason(_ seconds: TimeInterval) -> String {
        let whole = Int(seconds.rounded())
        return whole >= 60 && whole % 60 == 0 ? "still for \(whole / 60) min" : "still for \(whole) s"
    }
}
