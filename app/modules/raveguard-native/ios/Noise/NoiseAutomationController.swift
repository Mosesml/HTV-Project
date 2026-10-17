import Foundation

/// A Shortcuts automation pulls commands through App Intents instead of the app opening
/// shortcuts:// for every change. Nothing here can launch or foreground another app.
/// All access, including App Intents, is serialized on the main thread.
final class NoiseAutomationController: NoiseController {
    struct Command: Codable, Equatable {
        let action: String
        let request: String
    }

    var onConnectionChange: ((Bool) -> Void)?
    private let scheduler: NoiseDwellScheduling
    private let dwell: TimeInterval
    private let heartbeatTimeout: TimeInterval
    private var enabled = false
    private var runner: String?
    private var desired: NativeNoiseMode = .adaptive
    private var confirmed: NativeNoiseMode?
    private var pending: (id: String, mode: NativeNoiseMode)?
    private var lastCompletedAt: Date?
    private var expiry: NoiseScheduledAction?
    private(set) var connected = false

    init(scheduler: NoiseDwellScheduling = SystemNoiseDwellScheduler(),
         dwell: TimeInterval = 2, heartbeatTimeout: TimeInterval = 15) {
        self.scheduler = scheduler
        self.dwell = max(0, dwell)
        self.heartbeatTimeout = max(1, heartbeatTimeout)
    }

    func activate() {
        precondition(Thread.isMainThread)
        if !enabled { NSLog("RaveGuard relay: enabled (Background relay selected)") }
        enabled = true
    }

    func apply(level: Int) {
        precondition(Thread.isMainThread)
        desired = level >= 70 ? .noiseCancellation : .adaptive
        // An in-flight command must finish before another is issued. If the input moves
        // during execution, the next poll reconciles it after the dwell.
        if desired != confirmed { setConnected(false) }
    }

    /// A new automation invocation supersedes the old one, so App-open triggers cannot
    /// leave multiple competing loops controlling the same AirPods.
    func beginRelay() -> String {
        precondition(Thread.isMainThread)
        expiry?.cancel()
        expiry = nil
        let id = UUID().uuidString
        runner = id
        pending = nil
        confirmed = nil
        setConnected(false)
        return id
    }

    func next(runner id: String) -> Command {
        precondition(Thread.isMainThread)
        guard enabled, id == runner else { return Command(action: "stop", request: "") }
        refreshHeartbeat()
        // Keep returning the same request until acknowledged; a failed action is never
        // mistaken for applied ANC. The Shortcut must stop on an action error.
        if let pending { return Command(action: pending.mode.rawValue, request: pending.id) }
        guard desired != confirmed else {
            setConnected(true)
            return Command(action: "wait", request: "")
        }
        if let lastCompletedAt, scheduler.now.timeIntervalSince(lastCompletedAt) < dwell {
            return Command(action: "wait", request: "")
        }
        let request = UUID().uuidString
        pending = (request, desired)
        return Command(action: desired.rawValue, request: request)
    }

    @discardableResult
    func acknowledge(runner id: String, request: String) -> Bool {
        precondition(Thread.isMainThread)
        guard enabled, id == runner, let pending, pending.id == request else { return false }
        confirmed = pending.mode
        self.pending = nil
        lastCompletedAt = scheduler.now
        refreshHeartbeat()
        setConnected(confirmed == desired)
        return true
    }

    func reset() {
        precondition(Thread.isMainThread)
        if enabled { NSLog("RaveGuard relay: disabled (backend changed or session stopped)") }
        enabled = false
        runner = nil
        pending = nil
        confirmed = nil
        lastCompletedAt = nil
        expiry?.cancel()
        expiry = nil
        setConnected(false)
    }

    func invalidateOutput() {
        precondition(Thread.isMainThread)
        pending = nil
        confirmed = nil
        lastCompletedAt = nil
        setConnected(false)
    }

    private func refreshHeartbeat() {
        expiry?.cancel()
        expiry = scheduler.schedule(after: heartbeatTimeout) { [weak self] in
            guard let self else { return }
            // The next surviving poll must explicitly reapply the mode. We cannot assume
            // it remained selected after a stopped automation or disconnected AirPods.
            self.pending = nil
            self.confirmed = nil
            self.lastCompletedAt = nil
            self.setConnected(false)
        }
    }

    private func setConnected(_ value: Bool) {
        guard connected != value else { return }
        connected = value
        onConnectionChange?(value)
    }
}

/// Intents run in the app process (no extension). Keep a weak reference so reloading the
/// module cannot keep an obsolete runtime alive or acknowledge commands from an old run.
@MainActor
enum NoiseAutomationAccess {
    static weak var controller: NoiseAutomationController?
}
