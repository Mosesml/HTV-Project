import Foundation

/// Stand-in for `HeadMotionStream` (A2): emits triggers, nods and connection changes on
/// demand, from tests or the Debug panel. Nods are dropped unless the session is
/// listening, like the real detector.
final class FakeMotionSource: MotionEventSource, @unchecked Sendable {
    private let stateHub = MotionBroadcast<MotionState>(replayLatest: true)
    private let triggerHub = MotionBroadcast<MotionEvent>()
    private let nodHub = MotionBroadcast<Date>()
    private let connectedHub = MotionBroadcast<Bool>(replayLatest: true)
    private let lock = NSLock()
    private var _listening = false
    private var _running = false

    var states: AsyncStream<MotionState> { stateHub.stream() }
    var triggers: AsyncStream<MotionEvent> { triggerHub.stream() }
    var nods: AsyncStream<Date> { nodHub.stream() }
    var airPodsConnected: AsyncStream<Bool> { connectedHub.stream() }

    var isListeningForNod: Bool { lock.lock(); defer { lock.unlock() }; return _listening }
    var isRunning: Bool { lock.lock(); defer { lock.unlock() }; return _running }

    /// Number of live consumers of `triggers`; tests wait on it before firing.
    var triggerSubscriberCount: Int { triggerHub.subscriberCount }

    func setListeningForNod(_ on: Bool) { lock.lock(); _listening = on; lock.unlock() }

    func start() throws {
        lock.lock(); _running = true; lock.unlock()
        connectedHub.send(true)
    }

    func stop() { lock.lock(); _running = false; lock.unlock() }

    func fireTrigger(_ kind: TriggerKind = .fall,
                     reason: String = "spike 3.1 g, head 70° sideways, still 12 s",
                     at: Date = Date()) {
        triggerHub.send(MotionEvent(kind: kind, at: at, reason: reason,
                                    posture: kind == .fall ? Posture(pitchDeg: 5, rollDeg: 70) : nil))
    }

    /// Returns false (and emits nothing) when the session isn't listening.
    @discardableResult
    func fireNod(at: Date = Date()) -> Bool {
        guard isListeningForNod else { return false }
        nodHub.send(at)
        return true
    }

    func setState(_ state: MotionState) { stateHub.send(state) }
    func setConnected(_ connected: Bool) { connectedHub.send(connected) }
}
