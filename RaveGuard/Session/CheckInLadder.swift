import Foundation

/// A single-use check-in. Actions are commands for an external adapter, not executed IO.
public final class CheckInLadder {
    public enum Mode { case real, demo }
    public enum Stage: Equatable { case whisper, loud, pinGate }
    public enum PIN { case safe, duress, wrong }
    public enum CancelMode: Equatable { case safe, duress }
    public enum RemoteState { case pending, notifying, acknowledged, resolved, cancelled }
    public enum Phase: Equatable {
        case idle
        case prompting(Stage, until: Date)
        case awaitingServer
        case escalated
        case acknowledged
        case sos
        case cancelled
        case resolved
    }
    public enum Action: Equatable {
        case register(checkInID: UUID, deadline: Date)
        case prompt(Stage)
        case stopPrompts
        case cancel(checkInID: UUID, mode: CancelMode)
        case fireNow(checkInID: UUID)
        case fetchStatus(checkInID: UUID)
    }
    public let id: UUID
    public private(set) var phase: Phase = .idle
    private let clock: () -> Date
    private let elapsedClock: () -> TimeInterval
    private var elapsedOrigin: TimeInterval = 0
    private let whisperSeconds: TimeInterval
    private let loudSeconds: TimeInterval
    private let pinSeconds: TimeInterval
    private var startedAt: Date?
    private var wrongPINs = 0
    private var elapsed: TimeInterval = 0

    public init(id: UUID = UUID(), mode: Mode, clock: @escaping () -> Date = Date.init,
                elapsedClock: (() -> TimeInterval)? = nil) {
        self.id = id
        self.clock = clock
        if let elapsedClock {
            self.elapsedClock = elapsedClock
        } else {
            let continuous = ContinuousClock()
            let origin = continuous.now
            self.elapsedClock = {
                let duration = origin.duration(to: continuous.now).components
                return Double(duration.seconds) + Double(duration.attoseconds) / 1e18
            }
        }
        whisperSeconds = mode == .demo ? 10 : 20
        loudSeconds = mode == .demo ? 10 : 20
        pinSeconds = mode == .demo ? 15 : 30
    }

    /// Use this for countdown UI, not `until.timeIntervalSinceNow` (wall time can jump).
    public var secondsRemaining: TimeInterval? {
        guard case .prompting(let stage, _) = phase else { return nil }
        let end: TimeInterval
        switch stage {
        case .whisper: end = whisperSeconds
        case .loud: end = whisperSeconds + loudSeconds
        case .pinGate: end = whisperSeconds + loudSeconds + pinSeconds
        }
        return max(0, end - max(elapsed, elapsedClock() - elapsedOrigin))
    }

    /// Execute returned actions once. Repeated starts cannot extend the deadline.
    public func start() -> [Action] {
        guard phase == .idle else { return [] }
        let start = clock()
        startedAt = start
        elapsedOrigin = elapsedClock()
        phase = .prompting(.whisper, until: start.addingTimeInterval(whisperSeconds))
        return [.register(checkInID: id,
                          deadline: start.addingTimeInterval(whisperSeconds + loudSeconds + pinSeconds)),
                .prompt(.whisper)]
    }

    /// Absolute stage boundaries avoid extending the ladder when a timer fires late.
    public func tick() -> [Action] {
        guard let start = startedAt, case .prompting(let previous, _) = phase else { return [] }
        elapsed = max(elapsed, elapsedClock() - elapsedOrigin)
        let pinStart = whisperSeconds + loudSeconds
        let deadline = pinStart + pinSeconds
        if elapsed >= deadline {
            phase = .awaitingServer
            return [.stopPrompts, .fetchStatus(checkInID: id)]
        }
        if elapsed >= pinStart {
            phase = .prompting(.pinGate, until: start.addingTimeInterval(deadline))
            return previous == .pinGate ? [] : [.stopPrompts]
        }
        if elapsed >= whisperSeconds {
            phase = .prompting(.loud, until: start.addingTimeInterval(pinStart))
            return previous == .loud ? [] : [.prompt(.loud)]
        }
        return []
    }

    public func nod() -> [Action] { cancelPrompt() }
    public func tapCancel() -> [Action] { cancelPrompt() }

    private func cancelPrompt() -> [Action] {
        let transitions = tick()
        guard case .prompting(let stage, _) = phase, stage != .pinGate else { return transitions }
        // A boundary-crossing input cancels rather than playing an already-dismissed prompt.
        return cancel(.safe)
    }

    /// PIN verification belongs to D. Raw PINs and secrets never enter this core.
    public func submitPIN(_ pin: PIN) -> [Action] {
        let transitions = tick()
        guard case .prompting(.pinGate, _) = phase else { return transitions }
        switch pin {
        case .safe: return cancel(.safe)
        case .duress: return cancel(.duress)
        case .wrong:
            wrongPINs += 1
            if wrongPINs == 3 {
                phase = .awaitingServer
                return [.stopPrompts, .fireNow(checkInID: id)]
            }
            return transitions
        }
    }

    private func cancel(_ mode: CancelMode) -> [Action] {
        // Same local presentation for safe and duress, including later polling.
        // This is NOT confirmation that the server accepted a cancellation.
        phase = .cancelled
        return [.stopPrompts, .cancel(checkInID: id, mode: mode)]
    }

    /// Only feed status for this check-in. The adapter serializes requests/events.
    public func receive(_ state: RemoteState, sosOpen: Bool = false) -> [Action] {
        guard phase != .idle, phase != .cancelled, phase != .resolved else { return [] }
        if state == .pending { return [] }
        // Older notifying responses must not undo acknowledgment or SOS progression.
        if state == .notifying, phase == .acknowledged { return [] }
        let wasPrompting: Bool
        if case .prompting = phase { wasPrompting = true } else { wasPrompting = false }
        switch state {
        case .pending: break
        case .notifying:
            if phase != .sos { phase = sosOpen ? .sos : .escalated }
        case .acknowledged: phase = .acknowledged
        case .resolved: phase = .resolved
        case .cancelled: phase = .cancelled
        }
        return wasPrompting ? [.stopPrompts] : []
    }
}
