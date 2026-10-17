import Foundation

/// Turns raw head-motion samples into what the session consumes: fall triggers, nods,
/// a coarse motion state, and the 10 Hz Debug readout. Pure and single-threaded, so
/// `HeadMotionStream` runs it live and the replay harness runs it on recordings.
final class MotionPipeline {
    struct Output: Equatable {
        var trigger: MotionEvent?
        var nod: Date?
        /// Set only when the state changes.
        var state: MotionState?
        var readout: MotionReadout?
    }

    let fall: FallDetector
    let nod: NodDetector
    private var baseline = PostureBaseline()
    private let dateFor: (TimeInterval) -> Date
    private let readoutInterval: TimeInterval
    private var lastReadoutT: TimeInterval = -.infinity
    private(set) var state: MotionState = .unknown
    private var fallenSince: TimeInterval?
    private(set) var classifier: MotionClassifier

    /// - Parameter dateFor: maps a sample's `t` to wall-clock time.
    init(fall: FallDetectorConfig = .init(), nod: NodDetectorConfig = .init(),
         classifier: MotionClassifierConfig = .init(),
         readoutHz: Double = 10,
         dateFor: @escaping (TimeInterval) -> Date = { Date(timeIntervalSinceReferenceDate: $0) }) {
        self.fall = FallDetector(config: fall)
        self.nod = NodDetector(config: nod)
        self.classifier = MotionClassifier(config: classifier)
        self.dateFor = dateFor
        self.readoutInterval = 1 / readoutHz
    }

    var listeningForNod: Bool {
        get { nod.listening }
        set { nod.setListening(newValue) }
    }

    func process(_ s: MotionSample) -> Output {
        var out = Output()
        baseline.add(s, frozen: fall.hasCandidate || state == .fallen)

        if let f = fall.process(s, baseline: baseline) {
            out.trigger = MotionEvent(kind: .fall, at: dateFor(s.t), reason: f.reason, posture: f.posture)
            fallenSince = s.t
        }
        if let t = nod.process(s) { out.nod = dateFor(t) }

        let newState = classify(s)
        if newState != state { state = newState; out.state = newState }

        // 10 Hz, with a little slack so 50 Hz timestamps don't alias down to 8.3 Hz.
        if s.t - lastReadoutT >= readoutInterval * 0.95 {
            lastReadoutT = s.t
            out.readout = MotionReadout(state: state, pitchDeg: s.pitchDeg, rollDeg: s.rollDeg,
                                        accelG: s.accelG, at: dateFor(s.t))
        }
        return out
    }

    /// Dancing, walking or still from `MotionClassifier` (BL4), which sees every sample so
    /// its window and the wearer's baseline stay current. `fallen` overrides it from a fall
    /// trigger until the head is back near upright.
    private func classify(_ s: MotionSample) -> MotionState {
        let moving = classifier.process(s)
        if fallenSince != nil {
            if baseline.ready && baseline.tiltDeg(s) < fall.config.tiltDeg - fall.config.uprightHysteresisDeg {
                fallenSince = nil
            } else {
                return .fallen
            }
        }
        return moving
    }
}
