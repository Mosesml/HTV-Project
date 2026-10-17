import Foundation

/// Ladder timings from the PRD's "Escalation ladder" table. The server reads the same
/// values from the session's `demo` flag, so keep the two in step.
struct SessionTimings: Equatable, Sendable {
    var whisper: TimeInterval
    var loud: TimeInterval
    var pinGate: TimeInterval
    /// Contact 1, Contact 2 and venue staff each get this long to acknowledge (server side).
    var ackWindow: TimeInterval
    var heartbeat: TimeInterval
    var statusPoll: TimeInterval
    /// Backoff before retrying a server call that failed (register, cancel, fire).
    var retry: TimeInterval
    /// Still this long while monitoring starts a check-in (BL3, PRD A10: 2 min, demo 30 s).
    var stillnessTrigger: TimeInterval = 120

    /// Server deadline, measured from check-in start: the sum of the three stage windows.
    var deadline: TimeInterval { whisper + loud + pinGate }
    /// When the server opens the SOS screen, measured from check-in start.
    var sosAfter: TimeInterval { deadline + 3 * ackWindow }

    static let real = SessionTimings(whisper: 20, loud: 20, pinGate: 30, ackWindow: 120,
                                     heartbeat: 10, statusPoll: 3, retry: 2)
    static let demo = SessionTimings(whisper: 10, loud: 10, pinGate: 15, ackWindow: 20,
                                     heartbeat: 10, statusPoll: 3, retry: 2, stillnessTrigger: 30)
}

/// What `configure(settings)` hands the session. Settings themselves live in React Native.
struct SessionManagerConfig: Equatable, Sendable {
    var wearerName: String = ""
    var selfDescription: String = ""
    var recipients: [Contact] = []
    /// Scheduled check-in interval in minutes (30 or 60). Ignored in demo mode, where
    /// check-ins are fired from the Debug panel.
    var intervalMin: Int = 30
    var demo: Bool = false
    /// The only number the SOS screen may dial, and only in demo mode. RaveGuard never
    /// dials an emergency number (DEM-1).
    var teammatePhone: String? = nil

    var timings: SessionTimings { demo ? .demo : .real }

    var scheduledInterval: TimeInterval? {
        demo || intervalMin <= 0 ? nil : TimeInterval(intervalMin * 60)
    }

    /// Number the SOS screen's Call button dials: the teammate in demo mode, nothing otherwise.
    var sosDialNumber: String? { demo ? teammatePhone : nil }
}
