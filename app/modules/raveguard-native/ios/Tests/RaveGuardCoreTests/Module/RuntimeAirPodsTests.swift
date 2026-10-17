import Foundation
import Testing
@testable import RaveGuardCore

/// J12 contract addition: `onAirPods` and the snapshot's `airPodsConnected`, from the motion
/// source's connection stream, without changing `SessionManager`.
@MainActor
@Suite struct RuntimeAirPodsTests {

    @Test func airPodsAreUnknownUntilTheMotionSourceReports() async throws {
        let h = RuntimeHarness()
        #expect(h.runtime.snapshot().keys.contains("airPodsConnected"))
        #expect(h.runtime.snapshot()["airPodsConnected"]! == nil)
        try await h.startDemoSession()
        await h.waitUntil { !h.payloads(.onAirPods).isEmpty }
        #expect(h.payloads(.onAirPods).last?["connected"] as? Bool == true)
        #expect(h.runtime.snapshot()["airPodsConnected"] as? Bool == true)
    }

    @Test func airPodsDisconnectAndReconnectAreEmittedOnceEach() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        await h.waitUntil { h.payloads(.onAirPods).count == 1 }
        h.motion.setConnected(false)
        await h.waitUntil { h.payloads(.onAirPods).count == 2 }
        h.motion.setConnected(false)
        h.motion.setConnected(true)
        await h.waitUntil { h.payloads(.onAirPods).count == 3 }
        #expect(h.payloads(.onAirPods).map { $0["connected"] as? Bool } == [true, false, true])
        #expect(h.runtime.snapshot()["airPodsConnected"] as? Bool == true)
    }

    @Test func shutdownStopsReportingTheConnection() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        await h.waitUntil { h.payloads(.onAirPods).count == 1 }
        h.runtime.shutdown()
        h.motion.setConnected(false)
        await h.waitUntil { h.payloads(.onAirPods).count > 1 }
        #expect(h.payloads(.onAirPods).count == 1)
    }

    @Test func onAirPodsIsAnEvent() {
        #expect(RaveGuardRuntime.Event.allCases.last == .onAirPods)
    }
}
