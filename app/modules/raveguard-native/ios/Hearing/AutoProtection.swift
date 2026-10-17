import Foundation

/// Where room loudness comes from: the canned demo trace today, the phone mic once the audio
/// session (Moses's M5) is in. Reports room dB SPL once per `HearingConfig.readingInterval`.
@MainActor
protocol LevelSource: AnyObject {
    var onReading: ((Double) -> Void)? { get set }
    func start()
    func stop()
}

/// BL1: one session's automatic protection. Every reading updates the room level and the
/// dose; in `auto` it also steps the level loop. Pure, so the runtime owns the timing.
struct AutoProtection: Equatable, Sendable {
    let config: HearingConfig
    private(set) var hearing = HearingState()
    private var dose: DoseTracker
    private var loop: ProtectionLoop

    init(config: HearingConfig) {
        self.config = config
        dose = DoseTracker(config: config)
        loop = ProtectionLoop(config: config, startLevel: 0)
    }

    /// A new session: no readings, zero dose, automatic, easing from `level`.
    mutating func begin(level: Int) {
        hearing = HearingState(roomDb: nil, dosePercent: nil, mode: .auto)
        dose = DoseTracker(config: config)
        loop = ProtectionLoop(config: config, startLevel: level)
    }

    /// The session ended: readings go back to null; the mode stays as it was.
    mutating func end() {
        hearing.roomDb = nil
        hearing.dosePercent = nil
    }

    /// Returns whether the mode changed. Switching to `auto` eases on from `level`, the
    /// slider's, and keeps the dose floor already reached.
    mutating func setMode(_ mode: ProtectionMode, level: Int) -> Bool {
        guard hearing.mode != mode else { return false }
        hearing.mode = mode
        if mode == .auto { loop = loop.restarted(from: level) }
        return true
    }

    /// One meter reading. Returns the level to apply, or nil (manual, or not worth sending).
    /// - Parameter level: the level in force, which picks the AirPods mode for the dose.
    mutating func reading(roomDb: Double, level: Int, loudnessTarget: Double) -> Int? {
        dose.add(inEarDb: DoseTracker.inEarDb(roomDb: roomDb, level: level, config: config),
                 seconds: config.readingInterval)
        hearing.roomDb = roomDb
        hearing.dosePercent = dose.dosePercent
        guard hearing.mode == .auto else { return nil }
        return loop.step(roomDb: roomDb, loudnessTarget: loudnessTarget, dosePercent: dose.dosePercent)
    }
}
