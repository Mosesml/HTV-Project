import Foundation

/// What started the open check-in, as JavaScript sees it in `onPhase` (`trigger`).
struct CheckInTriggerInfo: Equatable, Sendable {
    let kind: TriggerKind
    let reason: String
    let at: Date

    var modulePayload: [String: Any?] {
        ["kind": kind.rawValue, "reason": reason, "at": at.timeIntervalSince1970 * 1000]
    }
}

/// Wraps the session log to learn what started each check-in, without touching Justin's
/// `SessionManager`: it records `.trigger` ("<kind>: <reason>") for every trigger it hears,
/// then `.checkInStarted` (detail: the kind) only for the one that opens a check-in. A trigger
/// that arrives while a check-in is already open is recorded but never promoted, so `current`
/// always names the trigger of the latest check-in. Everything is passed on to the real log.
final class TriggerTrackingLog: SessionLogging {
    private let inner: SessionLogging
    private var pending: CheckInTriggerInfo?
    /// The trigger of the most recent check-in (nil before the first).
    private(set) var current: CheckInTriggerInfo?

    init(wrapping inner: SessionLogging) { self.inner = inner }

    var events: [SessionEvent] { inner.events }

    func append(_ e: SessionEvent) {
        switch e.kind {
        case .trigger:
            pending = Self.parse(e.detail, at: e.at)
        case .checkInStarted:
            if let pending, pending.kind.rawValue == e.detail {
                current = pending
            } else if let kind = e.detail.flatMap(TriggerKind.init(rawValue:)) {
                // A check-in with no matching trigger line: keep the kind, the reason is unknown.
                current = CheckInTriggerInfo(kind: kind, reason: "", at: e.at)
            }
            pending = nil
        default:
            break
        }
        inner.append(e)
    }

    /// "fall: spike 3.1 g, head 70° sideways, still 12 s" → (.fall, "spike 3.1 g, …").
    static func parse(_ detail: String?, at: Date) -> CheckInTriggerInfo? {
        guard let detail, let separator = detail.range(of: ": ") else { return nil }
        guard let kind = TriggerKind(rawValue: String(detail[..<separator.lowerBound])) else { return nil }
        return CheckInTriggerInfo(kind: kind, reason: String(detail[separator.upperBound...]), at: at)
    }
}
