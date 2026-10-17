import Foundation
#if canImport(CoreMotion)
import CoreMotion
#endif

enum HeadMotionError: Error, Equatable {
    case unavailable      // no headphone motion on this device
    case notAuthorized    // Motion & Fitness permission denied
}

/// The slice of CMHeadphoneMotionManager that `HeadMotionStream` uses, so reconnect
/// handling can be tested without AirPods.
protocol HeadphoneMotionProvider: AnyObject {
    var isAvailable: Bool { get }
    var isAuthorized: Bool { get }
    var isActive: Bool { get }
    /// Called on the provider's queue with each sample, or an error.
    func startUpdates(_ handler: @escaping (MotionSample?, Error?) -> Void)
    func stopUpdates()
    /// Connection changes, on any queue.
    var onConnectionChange: ((Bool) -> Void)? { get set }
}

/// DET-1 / A3: AirPods head motion at ~50 Hz, run through `MotionPipeline` and published
/// as the `MotionEventSource` streams, plus raw samples (for the recorder) and the 10 Hz
/// readout (`onMotion`). Survives the AirPods being taken out and put back: it restarts
/// updates on reconnect and after any update error, for as long as it is running, unless
/// Motion & Fitness permission has been turned off. `airPodsConnected` reports changes only,
/// from CoreMotion's connect and disconnect, and from the first sample while not known to be
/// connected (iOS may not say "connected" for AirPods already in when updates start).
final class HeadMotionStream: MotionEventSource, @unchecked Sendable {
    private let provider: HeadphoneMotionProvider
    private let queue: DispatchQueue
    private let pipeline: MotionPipeline
    private let lock = NSLock()
    private var running = false
    private var restartPending = false
    private var lastConnected: Bool?
    /// A connection change waiting out `connectionSettle`; `connectionToken` voids stale waits.
    private var pendingConnected: Bool?
    private var connectionToken = 0
    /// Process uptime of the last sample, to tell whether updates resumed after a reconnect.
    private var lastSampleUptime: TimeInterval = -.infinity

    private let stateHub = MotionBroadcast<MotionState>(replayLatest: true)
    private let triggerHub = MotionBroadcast<MotionEvent>()
    private let nodHub = MotionBroadcast<Date>()
    private let connectedHub = MotionBroadcast<Bool>(replayLatest: true)
    private let sampleHub = MotionBroadcast<MotionSample>()
    private let readoutHub = MotionBroadcast<MotionReadout>(replayLatest: true)

    var states: AsyncStream<MotionState> { stateHub.stream() }
    var triggers: AsyncStream<MotionEvent> { triggerHub.stream() }
    var nods: AsyncStream<Date> { nodHub.stream() }
    var airPodsConnected: AsyncStream<Bool> { connectedHub.stream() }
    var samples: AsyncStream<MotionSample> { sampleHub.stream() }
    /// 10 Hz, for the Debug panel's `onMotion`.
    var readouts: AsyncStream<MotionReadout> { readoutHub.stream() }

    /// The J4 recorder sees every sample.
    let recorder: MotionRecorder

    /// J1: print pitch, roll and yaw (degrees) once per 10 samples, plus the measured rate.
    var printToConsole = false
    private var rateWindowStart: TimeInterval?
    private var rateCount = 0
    private var printCount = 0
    private(set) var measuredHz: Double = 0

    /// How long to wait before restarting after an update error.
    var restartDelay: TimeInterval = 1
    /// A connection change is published only once it has held this long, so iOS flicking
    /// disconnect/connect (it does on a phone) never reaches the app. 0 publishes at once.
    var connectionSettle: TimeInterval = 1.5
    /// After a reconnect, how long to wait for samples before restarting updates. 0 checks at once.
    var reconnectGrace: TimeInterval = 1

    init(provider: HeadphoneMotionProvider? = nil, recorder: MotionRecorder = MotionRecorder(),
         fall: FallDetectorConfig = .init(), nod: NodDetectorConfig = .init()) {
        self.recorder = recorder
        let queue = DispatchQueue(label: "raveguard.headmotion")
        self.queue = queue
        #if canImport(CoreMotion)
        self.provider = provider ?? CoreMotionHeadphoneProvider(queue: queue)
        #else
        self.provider = provider!
        #endif
        // CMDeviceMotion.timestamp is seconds since boot; map it to wall-clock time.
        // The couch-fall model when it loads (fall-model plan step 10), else the thresholds.
        self.pipeline = MotionPipeline(fall: fall, fallDetector: LearnedFallDetector.live(config: fall),
                                       nod: nod, dateFor: { t in
            Date(timeIntervalSinceNow: t - ProcessInfo.processInfo.systemUptime)
        })
        self.provider.onConnectionChange = { [weak self] connected in self?.connectionChanged(connected) }
    }

    var isRunning: Bool { lock.lock(); defer { lock.unlock() }; return running }

    func start() throws {
        guard provider.isAvailable else { throw HeadMotionError.unavailable }
        guard provider.isAuthorized else { throw HeadMotionError.notAuthorized }
        lock.lock()
        let wasRunning = running
        running = true
        lock.unlock()
        if !wasRunning {
            // Done before any sample of this session can arrive (samples come on the same queue).
            // Synchronous, so a sample delivered off the queue can't race it either.
            queue.sync { self.pipeline.resetForNewSession() }
            beginUpdates()
        }
    }

    func stop() {
        lock.lock(); running = false; lock.unlock()
        provider.stopUpdates()
    }

    func setListeningForNod(_ on: Bool) {
        queue.async { self.pipeline.listeningForNod = on }
    }

    private func beginUpdates() {
        provider.startUpdates { [weak self] sample, error in
            guard let self else { return }
            if let sample { self.handle(sample) }
            else if error != nil { self.updateFailed() }
        }
    }

    /// Sends only a change. Under the lock, so the delegate and the sample queue can't
    /// reorder a disconnect and a reconnect.
    /// The first value is published at once; a change after that only once it has held for
    /// `connectionSettle`. A sample says "connected", so it cancels a pending disconnect.
    private func reportConnected(_ connected: Bool) {
        lock.lock()
        if lastConnected == connected {
            if pendingConnected != nil { pendingConnected = nil; connectionToken &+= 1 }
            lock.unlock()
            return
        }
        if pendingConnected == connected { lock.unlock(); return }
        if lastConnected == nil || connectionSettle <= 0 {
            lastConnected = connected
            pendingConnected = nil
            connectionToken &+= 1
            lock.unlock()
            connectedHub.send(connected)
            return
        }
        pendingConnected = connected
        connectionToken &+= 1
        let token = connectionToken
        lock.unlock()
        queue.asyncAfter(deadline: .now() + connectionSettle) { [weak self] in self?.settleConnection(token) }
    }

    private func settleConnection(_ token: Int) {
        lock.lock()
        guard token == connectionToken, let value = pendingConnected else { lock.unlock(); return }
        pendingConnected = nil
        lastConnected = value
        lock.unlock()
        connectedHub.send(value)
    }

    private func connectionChanged(_ connected: Bool) {
        reportConnected(connected)
        guard connected, isRunning else { return }
        // Updates usually resume on their own after the AirPods come back, but not always,
        // so restart only if no sample arrives within `reconnectGrace`. Restarting while
        // samples flow made a phone report disconnect/connect again, forever.
        let connectedAt = ProcessInfo.processInfo.systemUptime
        if reconnectGrace <= 0 {
            restartIfSilent(since: connectedAt)
        } else {
            queue.asyncAfter(deadline: .now() + reconnectGrace) { [weak self] in
                self?.restartIfSilent(since: connectedAt)
            }
        }
    }

    private func restartIfSilent(since: TimeInterval) {
        lock.lock()
        let shouldRestart = running && lastSampleUptime < since
        lock.unlock()
        guard shouldRestart else { return }
        provider.stopUpdates()
        beginUpdates()
    }

    /// With Motion & Fitness denied, retrying every second can't help until the wearer
    /// changes Settings, so stop; the next session's `start()` says why.
    private func updateFailed() {
        guard provider.isAuthorized else {
            lock.lock(); running = false; lock.unlock()
            provider.stopUpdates()
            return
        }
        scheduleRestart()
    }

    private func scheduleRestart() {
        lock.lock()
        guard running, !restartPending else { lock.unlock(); return }
        restartPending = true
        lock.unlock()
        queue.asyncAfter(deadline: .now() + restartDelay) { [weak self] in
            guard let self else { return }
            self.lock.lock(); self.restartPending = false; let go = self.running; self.lock.unlock()
            guard go else { return }
            self.provider.stopUpdates()
            self.beginUpdates()
        }
    }

    /// Runs on `queue`.
    private func handle(_ sample: MotionSample) {
        lock.lock(); lastSampleUptime = ProcessInfo.processInfo.systemUptime; lock.unlock()
        reportConnected(true)
        measureRate(sample.t)
        sampleHub.send(sample)
        recorder.add(sample)
        let out = pipeline.process(sample)
        if let t = out.trigger { triggerHub.send(t) }
        if let n = out.nod { nodHub.send(n) }
        if let s = out.state { stateHub.send(s) }
        if let r = out.readout { readoutHub.send(r) }
        if printToConsole {
            printCount += 1
            if printCount % 10 == 0 {
                print(String(format: "pitch %7.1f°  roll %7.1f°  yaw %7.1f°  |a| %.2f g  %.0f Hz",
                             sample.pitchDeg, sample.rollDeg, sample.yawDeg, sample.accelG, measuredHz))
            }
        }
    }

    private func measureRate(_ t: TimeInterval) {
        if rateWindowStart == nil { rateWindowStart = t }
        rateCount += 1
        let span = t - rateWindowStart!
        if span >= 1 {
            measuredHz = Double(rateCount - 1) / span
            rateWindowStart = t
            rateCount = 1
        }
    }
}

#if canImport(CoreMotion)
extension MotionSample {
    public init(_ m: CMDeviceMotion) {
        self.init(t: m.timestamp,
                  pitch: m.attitude.pitch, roll: m.attitude.roll, yaw: m.attitude.yaw,
                  rotX: m.rotationRate.x, rotY: m.rotationRate.y, rotZ: m.rotationRate.z,
                  accX: m.userAcceleration.x, accY: m.userAcceleration.y, accZ: m.userAcceleration.z,
                  gravX: m.gravity.x, gravY: m.gravity.y, gravZ: m.gravity.z)
    }
}

/// The real provider: CMHeadphoneMotionManager (AirPods Pro, Max, 3rd gen and later).
final class CoreMotionHeadphoneProvider: NSObject, HeadphoneMotionProvider, CMHeadphoneMotionManagerDelegate {
    private let manager = CMHeadphoneMotionManager()
    private let operationQueue: OperationQueue
    var onConnectionChange: ((Bool) -> Void)?

    init(queue: DispatchQueue) {
        operationQueue = OperationQueue()
        operationQueue.maxConcurrentOperationCount = 1
        operationQueue.underlyingQueue = queue
        super.init()
        manager.delegate = self
    }

    var isAvailable: Bool { manager.isDeviceMotionAvailable }
    var isAuthorized: Bool {
        let status = CMHeadphoneMotionManager.authorizationStatus()
        return status != .denied && status != .restricted
    }
    var isActive: Bool { manager.isDeviceMotionActive }

    func startUpdates(_ handler: @escaping (MotionSample?, Error?) -> Void) {
        manager.startDeviceMotionUpdates(to: operationQueue) { motion, error in
            handler(motion.map(MotionSample.init), error)
        }
    }

    func stopUpdates() { manager.stopDeviceMotionUpdates() }

    func headphoneMotionManagerDidConnect(_ manager: CMHeadphoneMotionManager) { onConnectionChange?(true) }
    func headphoneMotionManagerDidDisconnect(_ manager: CMHeadphoneMotionManager) { onConnectionChange?(false) }
}
#endif
