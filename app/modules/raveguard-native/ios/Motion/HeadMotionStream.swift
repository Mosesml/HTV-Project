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
        self.pipeline = MotionPipeline(fall: fall, nod: nod, dateFor: { t in
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
            // Queued ahead of the first sample, which arrives on the same queue.
            queue.async { self.pipeline.resetForNewSession() }
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
    private func reportConnected(_ connected: Bool) {
        lock.lock(); defer { lock.unlock() }
        guard lastConnected != connected else { return }
        lastConnected = connected
        connectedHub.send(connected)
    }

    private func connectionChanged(_ connected: Bool) {
        reportConnected(connected)
        guard isRunning else { return }
        if !connected {
            // Stop a disconnected stream so reconnect can start it again. Checking the
            // active flag also makes a delegate echo from stopUpdates harmless.
            if provider.isActive { provider.stopUpdates() }
            return
        }
        // CoreMotion can announce a connection when updates start. Stopping an already
        // active stream here can generate another disconnect/connect and restart loop.
        guard !provider.isActive else { return }
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
