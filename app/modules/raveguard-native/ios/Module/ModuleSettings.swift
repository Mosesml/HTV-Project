import Foundation

/// `configure(settings)` from JavaScript, checked and converted. Settings storage lives in
/// React Native (K4); Swift keeps only what the session and noise control need.
struct ModuleSettings: Equatable, Sendable {
    var session: SessionManagerConfig
    /// In-ear loudness target in dB, for Moses's noise control.
    var loudnessTarget: Double
    /// The Linux bridge, for Moses's `BridgeController`.
    var bridgeURL: URL?
    /// Where friends should look for the wearer, for the alert brief. Empty when not set; a
    /// settings object from before the field existed reads as empty too. JavaScript limits it
    /// to 120 characters.
    var meetingSpot: String

    static let allowedIntervals: Set<Int> = [30, 60]
    static let loudnessRange: ClosedRange<Double> = 0...120
    /// The app's default (src/settings/defaults.ts), for a session started before `configure()`.
    static let defaultLoudnessTarget: Double = 85

    init(_ raw: [String: Any]) throws {
        let fields = ModuleFields(raw, path: "settings")

        let interval = try fields.int("intervalMin")
        guard Self.allowedIntervals.contains(interval) else {
            throw fields.invalid("intervalMin", "must be 30 or 60 (got \(interval))")
        }
        let loudness = try fields.number("loudnessTarget")
        guard Self.loudnessRange.contains(loudness) else {
            throw fields.invalid("loudnessTarget", "must be between 0 and 120 dB (got \(loudness))")
        }
        let recipients = try fields.array("recipients").enumerated().map { index, element in
            let path = "settings.recipients[\(index)]"
            guard let object = element as? [String: Any] else {
                throw ModuleError.invalid(field: path, reason: "must be an object")
            }
            return try Self.contact(ModuleFields(object, path: path))
        }

        session = SessionManagerConfig(
            wearerName: try fields.nonBlankString("wearerName"),
            selfDescription: try fields.string("selfDescription"),
            recipients: recipients,
            intervalMin: interval,
            demo: try fields.bool("demo"),
            teammatePhone: try fields.optionalPhone("teammatePhone"))
        loudnessTarget = loudness
        bridgeURL = try fields.optionalHTTPURL("bridgeUrl")
        meetingSpot = try fields.optionalString("meetingSpot", default: "")
    }

    private static func contact(_ fields: ModuleFields) throws -> Contact {
        guard let id = UUID(uuidString: try fields.string("id")) else {
            throw fields.invalid("id", "must be a UUID")
        }
        guard let kind = RecipientKind(rawValue: try fields.string("kind")) else {
            throw fields.invalid("kind", "must be contact or venueStaff")
        }
        // Missing permission keys fall back to PermissionSet's defaults, which share the least.
        let permissions = try fields.object("permissions")
        let defaults = PermissionSet()
        return Contact(
            id: id,
            name: try fields.nonBlankString("name"),
            phoneE164: try fields.phone("phoneE164"),
            kind: kind,
            order: try fields.int("order"),
            permissions: PermissionSet(
                receiveAlerts: try permissions.optionalBool("receiveAlerts", default: defaults.receiveAlerts),
                seeLocation: try permissions.optionalBool("seeLocation", default: defaults.seeLocation),
                seeFullBrief: try permissions.optionalBool("seeFullBrief", default: defaults.seeFullBrief),
                canResolve: try permissions.optionalBool("canResolve", default: defaults.canResolve)))
    }
}
