import Foundation
import Testing
@testable import RaveGuardCore

final class RecordingReporter: ResponderReporting, @unchecked Sendable {
    private let lock = NSLock()
    private var _reports: [GeoPoint] = []
    private var _clears = 0
    var reports: [GeoPoint] { lock.withLock { _reports } }
    var clears: Int { lock.withLock { _clears } }
    func reportResponder(name: String, phoneE164: String, fix: GeoPoint) async throws {
        lock.withLock { _reports.append(fix) }
    }
    func clearResponder() async { lock.withLock { _clears += 1 } }
}

private let sam = ResponderBeacon.Settings(name: "Sam", phoneE164: "+15555550201")
private func point(northM: Double, at: Date) -> GeoPoint {
    GeoPoint(lat: 43.4724 + northM / 111_320, lon: -80.5449, accuracyM: 10, at: at)
}

/// J15: the responder beacon only runs while opted in and in a session, and reports sparingly.
@MainActor
@Suite struct ResponderBeaconTests {

    @MainActor
    final class Harness {
        let clock = ManualSessionClock()
        let gps = FakeLocationSource()
        let reporter = RecordingReporter()
        lazy var beacon = ResponderBeacon(location: gps, reporter: reporter, clock: clock)
        func advance(_ s: TimeInterval) async { clock.advance(by: s); await beacon.settle() }
    }

    @Test func nothingRunsWhenNotOptedInOrWithoutASession() async {
        let h = Harness()
        h.beacon.sessionStarted()
        #expect(h.gps.calls.isEmpty, "a session alone doesn't share anything")
        h.beacon.sessionEnded()
        h.beacon.configure(sam)
        #expect(h.gps.calls.isEmpty, "opting in alone doesn't either")
        #expect(!h.beacon.isRunning)
    }

    @Test func optedInDuringASessionReportsTheFirstFix() async {
        let h = Harness()
        h.beacon.configure(sam)
        h.beacon.sessionStarted()
        #expect(h.beacon.isRunning)
        #expect(h.gps.calls.prefix(3) == ["beginSession", "requestFix", "startUpdates"])
        h.gps.answerFix(point(northM: 0, at: h.clock.now))
        await h.beacon.settle()
        #expect(h.reporter.reports.count == 1)
    }

    @Test func reportsAfterMoving100mOrEvery2MinutesNotOnEveryFix() async {
        let h = Harness()
        h.beacon.configure(sam); h.beacon.sessionStarted()
        h.gps.answerFix(point(northM: 0, at: h.clock.now)); await h.beacon.settle()
        for m in [20.0, 40, 60] { h.gps.move(to: point(northM: m, at: h.clock.now)) }   // small moves
        await h.beacon.settle()
        #expect(h.reporter.reports.count == 1)
        h.gps.move(to: point(northM: 130, at: h.clock.now))                              // 130 m from the last report
        await h.beacon.settle()
        #expect(h.reporter.reports.count == 2)
        await h.advance(120)                                                              // standing still: refresh
        #expect(h.reporter.reports.count == 3)
        #expect(h.reporter.reports.last == h.reporter.reports[1], "the refresh resends the latest fix")
    }

    @Test func endingTheSessionOrOptingOutStopsAndClears() async {
        let h = Harness()
        h.beacon.configure(sam); h.beacon.sessionStarted()
        h.beacon.sessionEnded()
        await h.beacon.settle()
        #expect(!h.beacon.isRunning)
        #expect(h.gps.calls.suffix(2) == ["stopUpdates", "endSession"])
        #expect(h.reporter.clears == 1)
        h.beacon.sessionStarted()
        h.beacon.configure(nil)
        await h.beacon.settle()
        #expect(!h.beacon.isRunning)
        #expect(h.reporter.clears == 2)
        await h.advance(600)
        h.gps.move(to: point(northM: 500, at: h.clock.now))
        await h.beacon.settle()
        #expect(h.reporter.reports.isEmpty, "nothing after opting out")
    }

    @Test func withoutAServerItNeverStarts() {
        let gps = FakeLocationSource()
        let beacon = ResponderBeacon(location: gps, reporter: nil, clock: ManualSessionClock())
        beacon.configure(sam); beacon.sessionStarted()
        #expect(!beacon.isRunning)
        #expect(gps.calls.isEmpty)
    }

    @Test func distanceIsInMetres() {
        let d = ResponderBeacon.distanceM(point(northM: 0, at: Date()), point(northM: 250, at: Date()))
        #expect(abs(d - 250) < 1)
    }
}

@Suite struct NearbyContractTests {

    @Test func statusWithANearbyResponderDecodes() throws {
        let json = #"{"state":"notifying","sosOpen":false,"recipients":[{"name":"Sam","kind":"nearby","notifiedAt":null,"ackedAt":null}]}"#
        let status = try JSONDecoder().decode(EscalationStatus.self, from: Data(json.utf8))
        #expect(status.recipients.first?.kind == .nearby)
    }

    @Test func settingsCannotNameANearbyRecipient() {
        var raw = ModuleSettingsTests.settings()
        var recipient = (raw["recipients"] as! [[String: Any]])[0]
        recipient["kind"] = "nearby"
        raw["recipients"] = [recipient]
        #expect(throws: (any Error).self) { try ModuleSettings(raw) }
    }

    @Test func responderSettingsParse() throws {
        #expect(try ModuleSettings(ModuleSettingsTests.settings()).responder == nil)
        let on = try ModuleSettings(ModuleSettingsTests.settings(["responder": ["enabled": true, "name": "Sam", "phoneE164": "+15555550201"]]))
        #expect(on.responder == ResponderBeacon.Settings(name: "Sam", phoneE164: "+15555550201"))
        let off = try ModuleSettings(ModuleSettingsTests.settings(["responder": ["enabled": false]]))
        #expect(off.responder == nil)
        #expect(throws: (any Error).self) {
            try ModuleSettings(ModuleSettingsTests.settings(["responder": ["enabled": true, "name": "Sam", "phoneE164": "555"]]))
        }
    }
}

@MainActor
@Suite struct RuntimeResponderTests {

    @Test func theRuntimeRunsTheBeaconOnlyWithItsSession() async throws {
        let clock = ManualSessionClock()
        let gps = FakeLocationSource()
        let reporter = ReportingScriptedService(clock: clock)
        let runtime = RaveGuardRuntime(clock: clock, escalation: reporter, motion: FakeMotionSource(), log: MemoryLog(),
                                       audioSession: RecordingAudioSession(), responderLocation: gps, emit: { _, _ in })
        try runtime.configure(ModuleSettingsTests.settings(["responder": ["enabled": true, "name": "Sam", "phoneE164": "+15555550201"]]))
        #expect(!runtime.responderBeacon.isRunning)
        runtime.startSession()
        #expect(runtime.responderBeacon.isRunning)
        #expect(runtime.stopSession())
        #expect(!runtime.responderBeacon.isRunning)
    }
}

/// The scripted server, plus the responder calls, as `ServerClient` would offer them.
@MainActor
final class ReportingScriptedService: EscalationService, ResponderReporting, @unchecked Sendable {
    let inner: ScriptedEscalationService
    init(clock: ManualSessionClock) { inner = ScriptedEscalationService(clock: clock, ackWindow: 10) }
    func startSession(wearerName: String, selfDescription: String, recipients: [Contact], demo: Bool) async throws {
        try await inner.startSession(wearerName: wearerName, selfDescription: selfDescription, recipients: recipients, demo: demo)
    }
    func heartbeat() async { await inner.heartbeat() }
    func register(deadline: Date, facts: BriefFacts) async throws -> String { try await inner.register(deadline: deadline, facts: facts) }
    func update(_ id: String, facts: BriefFacts) async throws { try await inner.update(id, facts: facts) }
    func cancel(_ id: String, mode: CancelMode) async throws { try await inner.cancel(id, mode: mode) }
    func fireNow(_ id: String) async throws { try await inner.fireNow(id) }
    func status(_ id: String) async throws -> EscalationStatus { try await inner.status(id) }
    func endSession() async throws { try await inner.endSession() }
    nonisolated func reportResponder(name: String, phoneE164: String, fix: GeoPoint) async throws {}
    nonisolated func clearResponder() async {}
}
