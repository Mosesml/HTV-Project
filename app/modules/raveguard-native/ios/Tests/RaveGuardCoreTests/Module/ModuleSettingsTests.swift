import Foundation
import Testing
@testable import RaveGuardCore

/// K2: `configure(settings)` from JavaScript, checked at the Swift boundary.
@Suite struct ModuleSettingsTests {
    static let recipientId = "6F9619FF-8B86-D011-B42D-00C04FC964FF"

    static func recipient(_ overrides: [String: Any] = [:]) -> [String: Any] {
        var r: [String: Any] = [
            "id": recipientId, "name": "Sam", "phoneE164": "+14165550123",
            "kind": "contact", "order": 1,
            "permissions": ["receiveAlerts": true, "seeLocation": true,
                            "seeFullBrief": false, "canResolve": true],
        ]
        r.merge(overrides) { _, new in new }
        return r
    }

    static func settings(_ overrides: [String: Any] = [:]) -> [String: Any] {
        var s: [String: Any] = [
            "wearerName": "Alex", "selfDescription": "black hoodie, white cap",
            "recipients": [recipient()], "intervalMin": 30, "loudnessTarget": 85,
            "demo": true, "teammatePhone": "+14165550199", "bridgeUrl": "http://192.168.1.20:8080",
            "meetingSpot": "left of the main stage, by the bar",
        ]
        s.merge(overrides) { _, new in new }
        return s
    }

    @Test func decodesValidSettingsIntoTheSessionConfig() throws {
        let decoded = try ModuleSettings(Self.settings())
        #expect(decoded.session.wearerName == "Alex")
        #expect(decoded.session.selfDescription == "black hoodie, white cap")
        #expect(decoded.session.intervalMin == 30)
        #expect(decoded.session.demo)
        #expect(decoded.session.teammatePhone == "+14165550199")
        #expect(decoded.loudnessTarget == 85)
        #expect(decoded.bridgeURL == URL(string: "http://192.168.1.20:8080"))
        #expect(decoded.meetingSpot == "left of the main stage, by the bar")
        let contact = try #require(decoded.session.recipients.first)
        #expect(contact.id == UUID(uuidString: Self.recipientId))
        #expect(contact.phoneE164 == "+14165550123")
        #expect(contact.kind == .contact)
        #expect(contact.order == 1)
        #expect(contact.permissions == PermissionSet(receiveAlerts: true, seeLocation: true,
                                                     seeFullBrief: false, canResolve: true))
    }

    /// The meeting spot is optional: missing, null and empty all read as empty.
    @Test func meetingSpotIsOptional() throws {
        var missing = Self.settings()
        missing.removeValue(forKey: "meetingSpot")
        #expect(try ModuleSettings(missing).meetingSpot == "")
        #expect(try ModuleSettings(Self.settings(["meetingSpot": NSNull()])).meetingSpot == "")
        #expect(try ModuleSettings(Self.settings(["meetingSpot": ""])).meetingSpot == "")
        #expect(throws: ModuleError.self) { try ModuleSettings(Self.settings(["meetingSpot": 42])) }
    }

    /// JavaScript values arrive bridged as NSNumber, booleans included.
    @Test func acceptsBridgedNumbersAndBooleans() throws {
        let decoded = try ModuleSettings(Self.settings([
            "intervalMin": NSNumber(value: 60.0), "loudnessTarget": NSNumber(value: 82.5),
            "demo": NSNumber(value: false),
        ]))
        #expect(decoded.session.intervalMin == 60)
        #expect(decoded.loudnessTarget == 82.5)
        #expect(!decoded.session.demo)
    }

    @Test func nullOptionalsBecomeNil() throws {
        let decoded = try ModuleSettings(Self.settings(["teammatePhone": NSNull(), "bridgeUrl": NSNull()]))
        #expect(decoded.session.teammatePhone == nil)
        #expect(decoded.bridgeURL == nil)
    }

    @Test func missingPermissionKeysFallBackToThePrivateDefaults() throws {
        let decoded = try ModuleSettings(Self.settings(["recipients": [Self.recipient(["permissions": [:]])]]))
        #expect(decoded.session.recipients.first?.permissions == PermissionSet())
    }

    @Test func allowsNoRecipients() throws {
        #expect(try ModuleSettings(Self.settings(["recipients": []])).session.recipients.isEmpty)
    }

    @Test(arguments: [
        ("wearerName", "   " as Any),
        ("intervalMin", 45 as Any),
        ("intervalMin", 30.5 as Any),
        ("loudnessTarget", 130 as Any),
        ("demo", "yes" as Any),
        ("demo", 1 as Any),
        ("teammatePhone", "4165550199" as Any),
        ("bridgeUrl", "ftp://192.168.1.20" as Any),
        ("bridgeUrl", "not a url" as Any),
        ("recipients", "Sam" as Any),
    ])
    func rejectsABadTopLevelField(field: String, value: Any) {
        #expect(throws: ModuleError.self) { try ModuleSettings(Self.settings([field: value])) }
    }

    @Test(arguments: [
        ("id", "abc" as Any),
        ("name", "" as Any),
        ("phoneE164", "416-555-0123" as Any),
        ("kind", "friend" as Any),
        ("order", 1.5 as Any),
        ("permissions", "all" as Any),
    ])
    func rejectsABadRecipientField(field: String, value: Any) {
        let raw = Self.settings(["recipients": [Self.recipient([field: value])]])
        #expect(throws: ModuleError.self) { try ModuleSettings(raw) }
    }

    @Test func rejectsAMissingField() {
        var raw = Self.settings()
        raw.removeValue(forKey: "wearerName")
        #expect(throws: ModuleError.missing(field: "settings.wearerName")) { try ModuleSettings(raw) }
    }

    @Test func errorMessageNamesTheRecipientField() {
        let raw = Self.settings(["recipients": [Self.recipient(["phoneE164": "416"])]])
        do {
            _ = try ModuleSettings(raw)
            Issue.record("expected a failure")
        } catch {
            #expect(error.localizedDescription.contains("settings.recipients[0].phoneE164"))
        }
    }
}
