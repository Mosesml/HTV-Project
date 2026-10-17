#if os(iOS)
import AVFoundation
import os

/// BL1 / C13: room loudness from the phone mic, once a second, through an `AVAudioEngine`
/// input tap. It never configures the audio session: that is Moses's (M5: `.playAndRecord`,
/// built-in mic, A2DP out to the AirPods). Until the session can record it reports nothing
/// and logs why, so a real session shows "—" rather than a wrong number. It starts measuring
/// by itself once the category allows recording, and again after a route change, an engine
/// reconfiguration (AirPods in or out) or an interruption ends.
@MainActor
final class MicLevelSource: LevelSource {
    var onReading: ((Double) -> Void)?

    private let config: HearingConfig
    private let engine = AVAudioEngine()
    private let log = Logger(subsystem: "com.raveguard.native", category: "hearing")
    private var wantsReadings = false
    private var isTapInstalled = false
    private var observers: [NSObjectProtocol] = []

    init(config: HearingConfig) { self.config = config }

    func start() {
        guard !wantsReadings else { return }
        wantsReadings = true
        observers = [
            // The engine stopped itself: AirPods in or out, or another input.
            observe(.AVAudioEngineConfigurationChange, object: engine) { source, _ in source.restart() },
            // Only starts a stopped engine (e.g. M5 just made the session recordable): starting
            // the engine can post a route change itself, so a full restart here could loop.
            observe(AVAudioSession.routeChangeNotification, object: nil) { source, _ in source.startEngine() },
            observe(AVAudioSession.interruptionNotification, object: nil) { source, note in
                let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
                if raw.flatMap(AVAudioSession.InterruptionType.init) == .ended { source.restart() }
            },
        ]
        startWhenAllowed()
    }

    func stop() {
        wantsReadings = false
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
        stopEngine()
    }

    private func observe(_ name: Notification.Name, object: AnyObject?,
                         _ handle: @escaping @MainActor @Sendable (MicLevelSource, Notification) -> Void) -> NSObjectProtocol {
        NotificationCenter.default.addObserver(forName: name, object: object, queue: .main) { [weak self] note in
            MainActor.assumeIsolated {
                guard let self else { return }
                handle(self, note)
            }
        }
    }

    private func startWhenAllowed() {
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            startEngine()
        case .undetermined:
            let target = WeakMicSource(self)
            AVAudioApplication.requestRecordPermission { granted in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { target.source?.permissionAnswered(granted) }
                }
            }
        case .denied:
            log.error("Microphone permission denied: no room readings this session")
        @unknown default:
            log.error("Unknown microphone permission: no room readings this session")
        }
    }

    private func permissionAnswered(_ granted: Bool) {
        guard wantsReadings else { return }
        if granted { startEngine() } else { log.error("Microphone permission refused: no room readings") }
    }

    /// The engine stops itself on a reconfiguration or interruption; start it again if wanted.
    private func restart() {
        guard wantsReadings, AVAudioApplication.shared.recordPermission == .granted else { return }
        stopEngine()
        startEngine()
    }

    private func startEngine() {
        guard wantsReadings, !isTapInstalled else { return }
        let category = AVAudioSession.sharedInstance().category
        guard category == .playAndRecord || category == .record else {
            log.notice("Audio session category \(category.rawValue, privacy: .public) can't record yet (M5)")
            return
        }
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.channelCount > 0, format.sampleRate > 0 else {
            log.error("No microphone input available: no room readings")
            return
        }
        let target = WeakMicSource(self)
        let tap = Self.tap(config: config, sampleRate: format.sampleRate) { roomDb in
            DispatchQueue.main.async { MainActor.assumeIsolated { target.source?.deliver(roomDb) } }
        }
        input.installTap(onBus: 0, bufferSize: 4096, format: format, block: tap)
        isTapInstalled = true
        engine.prepare()
        do {
            try engine.start()
        } catch {
            log.error("Couldn't start the microphone: \(error.localizedDescription, privacy: .public)")
            stopEngine()
        }
    }

    private func stopEngine() {
        if isTapInstalled {
            engine.inputNode.removeTap(onBus: 0)
            isTapInstalled = false
        }
        engine.stop()
    }

    private func deliver(_ roomDb: Double) {
        guard wantsReadings else { return }
        onReading?(roomDb)
    }

    /// Built outside the main actor: Core Audio calls the block on its own thread, and the
    /// accumulator is only ever touched there.
    nonisolated private static func tap(config: HearingConfig, sampleRate: Double,
                                        deliver: @escaping @Sendable (Double) -> Void) -> AVAudioNodeTapBlock {
        let box = AccumulatorBox(LevelAccumulator(config: config, sampleRate: sampleRate))
        return { buffer, _ in
            guard let channel = buffer.floatChannelData?[0] else { return }
            let samples = UnsafeBufferPointer(start: channel, count: Int(buffer.frameLength))
            if let roomDb = box.accumulator.add(samples) { deliver(roomDb) }
        }
    }
}

/// Lets audio and permission callbacks reach the source without keeping it alive. Set once at
/// init and read only on the main queue.
private final class WeakMicSource: @unchecked Sendable {
    weak var source: MicLevelSource?
    init(_ source: MicLevelSource) { self.source = source }
}

/// Holds the tap's accumulator; only the audio thread that runs the tap touches it.
private final class AccumulatorBox: @unchecked Sendable {
    var accumulator: LevelAccumulator
    init(_ accumulator: LevelAccumulator) { self.accumulator = accumulator }
}
#endif
