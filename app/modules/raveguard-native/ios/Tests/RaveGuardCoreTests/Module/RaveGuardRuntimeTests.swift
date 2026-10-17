import Foundation
import Testing
@testable import RaveGuardCore

/// Collects what the runtime would send to JavaScript.
@MainActor
final class EventSink {
    private(set) var events: [(RaveGuardRuntime.Event, [String: Any?])] = []
    func append(_ event: RaveGuardRuntime.Event, _ body: [String: Any?]) { events.append((event, body)) }
}

/// K2: the module's runtime, wired to fakes, as JavaScript sees it through events.
@MainActor
final class RuntimeHarness {
    let clock = ManualSessionClock()
    let server: ScriptedEscalationService
    let sink = EventSink()
    let runtime: RaveGuardRuntime

    init(noise: NoiseController = FakeNoiseController()) {
        server = ScriptedEscalationService(clock: clock, ackWindow: SessionTimings.demo.ackWindow)
        runtime = RaveGuardRuntime(clock: clock, escalation: server, motion: FakeMotionSource(),
                                   log: MemoryLog(), noise: noise, emit: { [sink] in sink.append($0, $1) })
    }

    func payloads(_ event: RaveGuardRuntime.Event) -> [[String: Any?]] {
        sink.events.filter { $0.0 == event }.map(\.1)
    }

    func phases() -> [String] { payloads(.onPhase).compactMap { $0["phase"] as? String } }
    func lastPhase() -> [String: Any?]? { payloads(.onPhase).last }

    func settle() async { await runtime.session.settle() }

    func advance(_ seconds: TimeInterval) async {
        var left = seconds
        while left > 0 {
            let step = min(1, left)
            clock.advance(by: step)
            left -= step
            await settle()
        }
    }

    func startDemoSession() async throws {
        try runtime.configure(ModuleSettingsTests.settings(["recipients": []]))
        runtime.startSession()
        await settle()
    }

    /// A real (not demo) session, where Swift schedules check-ins every `intervalMin`.
    func startRealSession(intervalMin: Int = 30) async throws {
        try runtime.configure(ModuleSettingsTests.settings(["recipients": [], "demo": false,
                                                            "intervalMin": intervalMin]))
        runtime.startSession()
        await settle()
    }

    func snapshotNextCheckInAt() -> Double? {
        runtime.snapshot()["nextCheckInAt"] as? Double
    }
}

@MainActor
@Suite struct RaveGuardRuntimeTests {

    @Test func startEmitsMonitoringAndHearingNulls() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        #expect(h.phases() == ["monitoring"])
        let hearing = try #require(h.payloads(.onHearing).last)
        #expect(hearing["roomDb"]! == nil)
        #expect(hearing["dosePercent"]! == nil)
    }

    @Test func badSettingsThrowAndLeaveTheConfigAlone() throws {
        let h = RuntimeHarness()
        #expect(throws: ModuleError.self) {
            try h.runtime.configure(ModuleSettingsTests.settings(["intervalMin": 45]))
        }
        #expect(h.runtime.session.config == SessionManagerConfig())
    }

    @Test func debugFireRunsTheRealLadderFromWhisper() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        try h.runtime.debugFire(2)
        await h.settle()
        let last = try #require(h.lastPhase())
        #expect(last["phase"] as? String == "checkIn")
        #expect(last["stage"] as? String == "whisper")
        let endsAt = try #require(last["stageEndsAt"] as? Double)
        #expect(endsAt == (h.clock.now.timeIntervalSince1970 + SessionTimings.demo.whisper) * 1000)
    }

    @Test func tapCancelReturnsToMonitoring() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        try h.runtime.debugFire(1)
        await h.settle()
        h.runtime.tapCancel()
        await h.settle()
        #expect(h.phases().last == "monitoring")
        #expect(h.payloads(.onEscalation).isEmpty)
    }

    /// The duress rule: the wearer sees an ordinary cancel and never an escalation.
    @Test func duressLooksLikeACancelAndNeverEmitsAnEscalation() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        try h.runtime.debugFire(1)
        await h.advance(SessionTimings.demo.whisper + SessionTimings.demo.loud)
        #expect(h.lastPhase()?["stage"] as? String == "pinGate")
        try h.runtime.pinResult("duress")
        await h.advance(120)
        #expect(h.phases().last == "monitoring")
        #expect(h.payloads(.onEscalation).isEmpty)
        #expect(h.runtime.snapshot()["escalation"]! == nil)
    }

    @Test func noResponseEscalatesAndTheSnapshotShowsIt() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        try h.runtime.debugFire(2)
        await h.advance(SessionTimings.demo.deadline + 5)
        #expect(h.phases().last == "escalated")
        let status = try #require(h.payloads(.onEscalation).last)
        #expect(status["state"] as? String == "notifying")
        #expect((status["recipients"] as? [[String: Any?]])?.first?["name"] as? String == "Contact 1")
        #expect(h.runtime.snapshot()["escalation"]! != nil)
    }

    @Test func motionReadoutsFlowAtTenHertzWhileTheSessionRuns() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        h.clock.advance(by: 1.05)
        #expect(h.payloads(.onMotion).count == 11)
        let first = try #require(h.payloads(.onMotion).first)
        #expect(first["state"] as? String == "still")
        #expect(first["pitch"] is Double)
        #expect(first["at"] is Double)
    }

    @Test func stopIsRefusedDuringACheckInAndStopsMotionWhenAllowed() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        try h.runtime.debugFire(1)
        await h.settle()
        #expect(!h.runtime.stopSession())
        h.runtime.tapCancel()
        await h.settle()
        #expect(h.runtime.stopSession())
        let readouts = h.payloads(.onMotion).count
        h.clock.advance(by: 1)
        #expect(h.payloads(.onMotion).count == readouts)
        #expect(h.phases().last == "idle")
    }

    @Test func protectionLevelAndBackendEmitNoiseState() throws {
        let h = RuntimeHarness()
        try h.runtime.setProtectionLevel(70)
        try h.runtime.setNoiseBackend("bridge")
        let noise = h.payloads(.onNoise)
        #expect(noise.count == 2)
        #expect(noise[0]["level"] as? Int == 70)
        #expect(noise[0]["backend"] as? String == "off")
        #expect(noise[1]["backend"] as? String == "bridge")
        #expect(noise[1]["connected"] as? Bool == true)
    }

    /// K8's done-when: the manual slider changes the fake noise output.
    @Test func protectionLevelDrivesTheFakeNoiseController() throws {
        let noise = FakeNoiseController()
        let h = RuntimeHarness(noise: noise)
        try h.runtime.setProtectionLevel(55)
        #expect(noise.level == 55)
        #expect(h.payloads(.onNoise).last?["level"] as? Int == 55)
        try h.runtime.setProtectionLevel(80)
        #expect(noise.level == 80)
        #expect(h.payloads(.onNoise).map { $0["level"] as? Int } == [55, 80])
        #expect((h.runtime.snapshot()["noise"] as? [String: Any?])?["level"] as? Int == 80)
    }

    @Test(arguments: [-1, 101])
    func protectionLevelOutOfRangeThrows(level: Int) {
        let h = RuntimeHarness()
        #expect(throws: ModuleError.self) { try h.runtime.setProtectionLevel(level) }
        #expect(h.payloads(.onNoise).isEmpty)
    }

    @Test func unknownKindsAndScenariosThrow() {
        let h = RuntimeHarness()
        #expect(throws: ModuleError.self) { try h.runtime.pinResult("maybe") }
        #expect(throws: ModuleError.self) { try h.runtime.setNoiseBackend("wifi") }
        #expect(throws: ModuleError.self) { try h.runtime.debugFire(0) }
        #expect(throws: ModuleError.self) { try h.runtime.debugFire(8) }
    }

    @Test func debugSetOfflineReachesTheSession() {
        let h = RuntimeHarness()
        h.runtime.debugSetOffline(true)
        #expect(h.runtime.session.simulatedOffline)
    }

    @Test func snapshotBeforeAnythingIsIdle() throws {
        let snapshot = RuntimeHarness().runtime.snapshot()
        let phase = try #require(snapshot["phase"] as? [String: Any?])
        #expect(phase["phase"] as? String == "idle")
        #expect(snapshot["escalation"]! == nil)
        #expect((snapshot["noise"] as? [String: Any?])?["level"] as? Int == 0)
        #expect((snapshot["hearing"] as? [String: Any?])?["roomDb"]! == nil)
        #expect(snapshot.keys.contains("nextCheckInAt"))
        #expect(snapshot["nextCheckInAt"]! == nil)
    }

    @Test func snapshotCarriesTheNextScheduledCheckInInEpochMilliseconds() async throws {
        let h = RuntimeHarness()
        try await h.startRealSession(intervalMin: 30)
        #expect(h.snapshotNextCheckInAt() == (h.clock.now.timeIntervalSince1970 + 1800) * 1000)
    }

    @Test func nextCheckInIsNullInDemoModeAndAfterStop() async throws {
        let demo = RuntimeHarness()
        try await demo.startDemoSession()
        #expect(demo.snapshotNextCheckInAt() == nil)

        let real = RuntimeHarness()
        try await real.startRealSession()
        #expect(real.runtime.stopSession())
        #expect(real.snapshotNextCheckInAt() == nil)
    }

    @Test func nextCheckInIsRescheduledWhenACheckInIsCancelled() async throws {
        let h = RuntimeHarness()
        try await h.startRealSession(intervalMin: 60)
        try h.runtime.debugFire(1)
        await h.settle()
        #expect(h.snapshotNextCheckInAt() == nil)
        await h.advance(3)
        h.runtime.tapCancel()
        await h.settle()
        #expect(h.phases().last == "monitoring")
        #expect(h.snapshotNextCheckInAt() == (h.clock.now.timeIntervalSince1970 + 3600) * 1000)
    }
}

@Suite struct ModulePayloadTests {
    @Test func escalationStatusEncodesRecipientsWithEpochMilliseconds() throws {
        let notified = Date(timeIntervalSince1970: 1_800_000_000)
        let status = EscalationStatus(state: "acknowledged", recipients: [
            RecipientStatus(name: "Sam", kind: .contact, notifiedAt: notified, ackedAt: nil),
        ], sosOpen: false)
        let payload = status.modulePayload
        #expect(payload["state"] as? String == "acknowledged")
        #expect(payload["sosOpen"] as? Bool == false)
        let recipient = try #require((payload["recipients"] as? [[String: Any?]])?.first)
        #expect(recipient["kind"] as? String == "contact")
        #expect(recipient["notifiedAt"] as? Double == 1_800_000_000_000)
        #expect(recipient["ackedAt"]! == nil)
    }
}
