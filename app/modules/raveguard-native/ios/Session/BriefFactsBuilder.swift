import Foundation

/// A12 / BRF-1: turns the on-device session log into the `BriefFacts` the server writes
/// the brief from. Only these derived facts leave the phone, never the log or raw motion.
///
/// - `lastActiveState` / `lastActiveUntil`: the last time this session the wearer was
///   dancing or walking before the trigger, and when that ended ("dancing until 01:42").
///   Still active at the trigger means until the trigger. Nothing active → `.unknown`, nil.
/// - `promptsUnanswered`: prompts that went by without an answer in the current check-in:
///   1 once the loud prompt starts, 2 once the PIN gate opens.
enum BriefFactsBuilder {
    static let activeStates: Set<MotionState> = [.dancing, .walking]

    static func build(events: [SessionEvent], wearerName: String, selfDescription: String,
                      trigger: MotionEvent, location: GeoPoint? = nil) -> BriefFacts {
        let session = currentSession(events)
        let active = lastActive(in: session, before: trigger.at)
        return BriefFacts(wearerName: wearerName, selfDescription: selfDescription,
                          lastActiveState: active?.state ?? .unknown,
                          lastActiveUntil: active?.until,
                          trigger: trigger,
                          promptsUnanswered: promptsUnanswered(in: session),
                          location: location)
    }

    /// Events from the most recent `sessionStarted` on.
    static func currentSession(_ events: [SessionEvent]) -> ArraySlice<SessionEvent> {
        guard let start = events.lastIndex(where: { $0.kind == .sessionStarted && !isStartNote($0) })
        else { return events[...] }
        return events[start...]
    }

    static func lastActive(in session: ArraySlice<SessionEvent>, before cutoff: Date)
        -> (state: MotionState, until: Date)? {
        var state: MotionState?
        var until: Date?
        for e in session where e.kind == .motionState && e.at <= cutoff {
            guard let s = e.detail.flatMap(MotionState.init(rawValue:)) else { continue }
            if activeStates.contains(s) {
                state = s
                until = nil
            } else if state != nil, until == nil {
                until = e.at
            }
        }
        guard let state else { return nil }
        return (state, until ?? cutoff)
    }

    static func promptsUnanswered(in session: ArraySlice<SessionEvent>) -> Int {
        guard let start = session.lastIndex(where: { $0.kind == .checkInStarted }) else { return 0 }
        return session[start...].filter { $0.kind == .promptEscalated || $0.kind == .pinGateOpened }.count
    }

    /// `SessionManager` logs a second `sessionStarted` with a note when motion can't start;
    /// that one doesn't begin a new session.
    private static func isStartNote(_ e: SessionEvent) -> Bool {
        e.detail?.hasPrefix("motion unavailable") == true
    }
}

extension BriefFacts {
    /// The same facts with a newer fix (AN10).
    func with(location: GeoPoint?) -> BriefFacts {
        BriefFacts(wearerName: wearerName, selfDescription: selfDescription, lastActiveState: lastActiveState,
                   lastActiveUntil: lastActiveUntil, trigger: trigger, promptsUnanswered: promptsUnanswered,
                   location: location)
    }
}
