import Foundation

/// Where `onMotion` readouts come from while a session runs: the canned sway, or the AirPods.
@MainActor
protocol MotionReadoutFeed: AnyObject {
    var onReadout: ((MotionReadout) -> Void)? { get set }
    var isRunning: Bool { get }
    func start()
    func stop()
}

extension CannedMotionFeed: MotionReadoutFeed {}

/// `onMotion` readouts from `HeadMotionStream.readouts` (J12): 10 Hz from the AirPods while a
/// session runs. Each `start()` reads a fresh stream and drops readouts stamped before it:
/// the readout hub replays its latest value to a new reader, which is the previous session's.
@MainActor
final class LiveMotionFeed: MotionReadoutFeed {
    var onReadout: ((MotionReadout) -> Void)?
    var isRunning: Bool { task != nil }

    private let readouts: () -> AsyncStream<MotionReadout>
    /// Wall-clock time, like the readouts' `at` (MotionPipeline maps sample time to it).
    private let now: () -> Date
    private var task: Task<Void, Never>?

    init(readouts: @escaping () -> AsyncStream<MotionReadout>, now: @escaping () -> Date = Date.init) {
        self.readouts = readouts
        self.now = now
    }

    func start() {
        guard task == nil else { return }
        let since = now()
        let stream = readouts()
        task = Task { [weak self] in
            for await readout in stream {
                guard !Task.isCancelled else { return }
                guard readout.at >= since else { continue }
                self?.onReadout?(readout)
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }
}
