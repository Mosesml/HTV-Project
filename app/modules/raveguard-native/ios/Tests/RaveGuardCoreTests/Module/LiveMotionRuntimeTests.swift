import Foundation
import Testing
@testable import RaveGuardCore

/// J12 (motion half): the runtime on Justin's real `HeadMotionStream`, over fake AirPods, as
/// `withFakes` builds it on a phone.
@MainActor
final class LiveRuntimeHarness {
    let clock = ManualSessionClock()
    let server: ScriptedEscalationService
    let sink = EventSink()
    let airPods = FakeHeadphones()
    let stream: HeadMotionStream
    let runtime: RaveGuardRuntime

    init() {
        server = ScriptedEscalationService(clock: clock, ackWindow: SessionTimings.demo.ackWindow)
        let stream = HeadMotionStream(provider: airPods)
        self.stream = stream
        runtime = RaveGuardRuntime(clock: clock, escalation: server, motion: stream, log: MemoryLog(),
                                   readouts: { stream.readouts },
                                   emit: { [sink] in sink.append($0, $1) })
    }

    func payloads(_ event: RaveGuardRuntime.Event) -> [[String: Any?]] {
        sink.events.filter { $0.0 == event }.map(\.1)
    }

    func waitUntil(_ condition: () -> Bool) async {
        await RaveGuardCoreTests.waitUntil(condition)
    }

    func startSession() async throws {
        try runtime.configure(ModuleSettingsTests.settings(["recipients": []]))
        runtime.startSession()
        await runtime.session.settle()
    }

    /// `seconds` of 50 Hz head motion, delivered at once and stamped from `start` (system
    /// uptime, like CoreMotion's timestamps; the pipeline maps it to the wall clock). The
    /// default stamps run from now into the future.
    func move(seconds: Double, pitchDeg: Double = 20,
              from start: TimeInterval = ProcessInfo.processInfo.systemUptime) {
        for i in 0..<Int(seconds * 50) {
            airPods.emit(MotionSample(t: start + Double(i) / 50, pitch: pitchDeg * .pi / 180, roll: 0, yaw: 0,
                                      rotX: 0, rotY: 0, rotZ: 0, accX: 0.01, accY: 0, accZ: 0))
        }
    }
}

@MainActor
@Suite struct LiveMotionRuntimeTests {

    @Test func liveReadoutsBecomeOnMotionWhileASessionRuns() async throws {
        let h = LiveRuntimeHarness()
        try await h.startSession()
        h.move(seconds: 1)
        await h.waitUntil { h.payloads(.onMotion).count >= 9 }
        let first = try #require(h.payloads(.onMotion).first)
        #expect(abs((first["pitch"] as? Double ?? 0) - 20) < 0.001)
        #expect(first["state"] is String)
        #expect(first["at"] is Double)
        // No canned sway on the session clock.
        let live = h.payloads(.onMotion).count
        h.clock.advance(by: 2)
        #expect(h.payloads(.onMotion).count == live)
    }

    @Test func nothingIsForwardedAfterStop() async throws {
        let h = LiveRuntimeHarness()
        try await h.startSession()
        h.move(seconds: 0.5)
        await h.waitUntil { h.payloads(.onMotion).count >= 4 }
        #expect(h.runtime.stopSession())
        #expect(!h.stream.isRunning)
        let readouts = h.payloads(.onMotion).count
        h.move(seconds: 0.5)
        await h.waitUntil { h.payloads(.onMotion).count > readouts }
        #expect(h.payloads(.onMotion).count == readouts)
    }

    /// The readout hub replays its latest value to a new reader; from the last session, it's stale.
    @Test func aStaleReadoutFromThePreviousSessionIsNotForwarded() async throws {
        let h = LiveRuntimeHarness()
        try await h.startSession()
        // Stamped so the last readout is from just now, as it would be for real.
        h.move(seconds: 0.5, pitchDeg: 10, from: ProcessInfo.processInfo.systemUptime - 0.5)
        await h.waitUntil { h.payloads(.onMotion).count >= 4 }
        #expect(h.runtime.stopSession())
        let firstSession = h.payloads(.onMotion).count
        try await Task.sleep(nanoseconds: 2_000_000)   // the next session starts strictly later

        h.runtime.startSession()
        await h.runtime.session.settle()
        await h.waitUntil { h.payloads(.onMotion).count > firstSession }
        #expect(h.payloads(.onMotion).count == firstSession)

        h.move(seconds: 0.5, pitchDeg: 30)
        await h.waitUntil { h.payloads(.onMotion).count > firstSession }
        let next = try #require(h.payloads(.onMotion).dropFirst(firstSession).first)
        #expect(abs((next["pitch"] as? Double ?? 0) - 30) < 0.001)
    }

    @Test func airPodsConnectionIsEmittedOncePerChangeAndTheSnapshotFollows() async throws {
        let h = LiveRuntimeHarness()
        #expect(h.runtime.snapshot()["airPodsConnected"]! == nil)
        try await h.startSession()
        h.move(seconds: 0.2)
        await h.waitUntil { h.payloads(.onAirPods).count == 1 }
        #expect(h.runtime.snapshot()["airPodsConnected"] as? Bool == true)

        h.airPods.takeOut()
        await h.waitUntil { h.payloads(.onAirPods).count == 2 }
        #expect(h.runtime.snapshot()["airPodsConnected"] as? Bool == false)

        h.airPods.putBack()
        h.move(seconds: 0.2)
        await h.waitUntil { h.payloads(.onAirPods).count > 3 }
        #expect(h.payloads(.onAirPods).map { $0["connected"] as? Bool } == [true, false, true])
        #expect(h.runtime.snapshot()["airPodsConnected"] as? Bool == true)
    }

    @Test func shutdownStopsTheLiveReadouts() async throws {
        let h = LiveRuntimeHarness()
        try await h.startSession()
        h.runtime.shutdown()
        h.move(seconds: 0.5)
        await h.waitUntil { !h.payloads(.onMotion).isEmpty }
        #expect(h.payloads(.onMotion).isEmpty)
    }
}
