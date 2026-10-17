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
        hearing.inEarDb = nil
        hearing.floorLevel = nil
    }

    /// Returns whether the mode changed. Switching to `auto` eases on from `level`, the
    /// slider's, and keeps the dose floor already reached.
    mutating func setMode(_ mode: ProtectionMode, level: Int) -> Bool {
        guard hearing.mode != mode else { return false }
        hearing.mode = mode
        if mode == .auto { loop = loop.restarted(from: level) }
        // The floor only binds the loop; it shows again with the next automatic reading.
        if mode == .manual { hearing.floorLevel = nil }
        return true
    }

    /// One meter reading. Returns the level to apply, or nil (manual, or not worth sending).
    /// - Parameter level: the level in force, which picks the AirPods mode for the dose; nil
    ///   when RaveGuard isn't controlling the AirPods, so the dose counts the full room level.
    mutating func reading(roomDb: Double, level: Int?, loudnessTarget: Double) -> Int? {
        let inEarDb = DoseTracker.inEarDb(roomDb: roomDb, level: level, config: config)
        dose.add(inEarDb: inEarDb, seconds: config.readingInterval)
        hearing.roomDb = roomDb
        hearing.dosePercent = dose.dosePercent
        hearing.inEarDb = inEarDb
        guard hearing.mode == .auto else { return nil }
        let next = loop.step(roomDb: roomDb, loudnessTarget: loudnessTarget, dosePercent: dose.dosePercent)
        hearing.floorLevel = loop.floor
        return next
    }
}
