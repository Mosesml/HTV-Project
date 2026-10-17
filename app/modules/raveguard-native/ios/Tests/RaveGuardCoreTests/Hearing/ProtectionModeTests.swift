import Foundation
import Testing
@testable import RaveGuardCore

/// BL1's contract: `setProtectionMode(auto | manual)` and the `mode` `onHearing` reports.
@MainActor
@Suite struct ProtectionModeTests {

    @Test func idleSnapshotHasAutomaticProtection() {
        let hearing = RuntimeHarness().runtime.snapshot()["hearing"] as? [String: Any?]
        #expect(hearing?["mode"] as? String == "auto")
    }

    @Test func setProtectionModeEmitsOnHearingWithTheMode() throws {
        let h = RuntimeHarness()
        try h.runtime.setProtectionMode("manual")
        try h.runtime.setProtectionMode("auto")
        #expect(h.payloads(.onHearing).map { $0["mode"] as? String } == ["manual", "auto"])
        #expect((h.runtime.snapshot()["hearing"] as? [String: Any?])?["mode"] as? String == "auto")
    }

    @Test func unknownModeThrowsAndChangesNothing() {
        let h = RuntimeHarness()
        #expect(throws: ModuleError.self) { try h.runtime.setProtectionMode("loud") }
        #expect(h.payloads(.onHearing).isEmpty)
    }

    /// The slider is the manual override (HRG-5): moving it ends automatic protection.
    @Test func setProtectionLevelSwitchesToManualAndSaysSoOnce() throws {
        let h = RuntimeHarness()
        try h.runtime.setProtectionLevel(40)
        try h.runtime.setProtectionLevel(45)
        #expect(h.payloads(.onHearing).map { $0["mode"] as? String } == ["manual"])
    }
}
