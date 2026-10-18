import Foundation
#if os(iOS)
import AudioToolbox
#endif

/// One system vibration, about 0.4 s long.
protocol Vibrating: AnyObject {
    func buzz()
}

/// The system vibration (`kSystemSoundID_Vibrate`). Unlike UIKit's feedback generators and
/// Core Haptics, it still plays while the app runs in the background with the phone locked,
/// which the session's audio background mode allows, so it reaches a phone in a pocket.
/// It needs Settings > Sounds & Haptics to play haptics in silent mode.
final class SystemVibrator: Vibrating {
    func buzz() {
        #if os(iOS)
        AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
        #endif
    }
}

/// A rhythm: buzzes at `buzzes` seconds into each `period`, repeated. A system buzz lasts
/// about 0.4 s, so a "long" buzz is two chained ones.
struct VibrationPattern: Equatable, Sendable {
    let period: TimeInterval
    let buzzes: [TimeInterval]

    /// "Are you okay?" (whisper): a long buzz every 2 s.
    static let whisper = VibrationPattern(period: 2, buzzes: [0, 0.45])
    /// Louder prompt: a double buzz about every second and a half.
    static let loud = VibrationPattern(period: 1.5, buzzes: [0, 0.55])
    /// PIN gate: continuous, the last chance before contacts are texted.
    static let pinGate = VibrationPattern(period: 0.5, buzzes: [0])
    /// "Your people have been texted": a long buzz every 3 s while the chain runs.
    static let alert = VibrationPattern(period: 3, buzzes: [0, 0.45])
    /// SOS: continuous.
    static let sos = VibrationPattern(period: 0.5, buzzes: [0])

    /// The rhythm for the screen the wearer sees, or nil when nothing should vibrate. After a
    /// duress PIN the session shows `.monitoring`, so it stays silent like a safe cancel.
    static func forPhase(_ phase: SessionPhase) -> VibrationPattern? {
        switch phase {
        case .checkIn(.whisper, _): return .whisper
        case .checkIn(.loud, _): return .loud
        case .checkIn(.pinGate, _): return .pinGate
        case .escalated: return .alert
        case .sos: return .sos
        case .idle, .monitoring: return nil
        }
    }
}

/// Plays the rhythm for the current alert screen from the time it opens until the wearer
/// answers or the screen changes. Runs on the session clock, so it keeps going with the
/// phone locked and tests drive it without waiting.
@MainActor
final class AlertVibration {
    private let clock: SessionClock
    private let vibrator: Vibrating
    private(set) var pattern: VibrationPattern?
    private var timers: [SessionTimer] = []

    init(clock: SessionClock, vibrator: Vibrating) {
        self.clock = clock
        self.vibrator = vibrator
    }

    /// Switches to the rhythm for `phase`. A screen that keeps the same rhythm (a new stage
    /// deadline, or the PIN gate turning into SOS) doesn't restart it.
    func follow(_ phase: SessionPhase) {
        let next = VibrationPattern.forPhase(phase)
        guard next != pattern else { return }
        stop()
        pattern = next
        if let next { play(next) }
    }

    func stop() {
        timers.forEach { $0.cancel() }
        timers.removeAll()
        pattern = nil
    }

    private func play(_ rhythm: VibrationPattern) {
        timers.removeAll()   // the previous cycle's timers have all fired
        for offset in rhythm.buzzes {
            if offset <= 0 {
                vibrator.buzz()
            } else {
                timers.append(clock.schedule(after: offset) { [weak self] in self?.vibrator.buzz() })
            }
        }
        timers.append(clock.schedule(after: rhythm.period) { [weak self] in
            guard let self, self.pattern == rhythm else { return }
            self.play(rhythm)
        })
    }
}
