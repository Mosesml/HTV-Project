import Foundation
import Testing
@testable import RaveGuardCore

/// UI redesign contract additions: `onPhase`'s `trigger` (what started the check-in) and
/// `onAirPods` / the snapshot's `airPodsConnected`, both added by the runtime without
/// changing `SessionManager`.
@MainActor
@Suite struct RuntimeTriggerAndAirPodsTests {
    private func trigger(_ payload: [String: Any?]?) -> [String: Any?]? {
        guard let payload, let value = payload["trigger"] else { return nil }
        return value as? [String: Any?]
    }

    @Test func aFallCheckInCarriesItsKindReasonAndTime() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        try h.runtime.debugFire(2)
        await h.settle()
        let last = try #require(h.lastPhase())
        #expect(last["phase"] as? String == "checkIn")
        let info = try #require(trigger(last))
        #expect(info["kind"] as? String == "fall")
        #expect(info["reason"] as? String == "spike 3.1 g, head 70° sideways, still 12 s (debug)")
        #expect(info["at"] as? Double == h.clock.now.timeIntervalSince1970 * 1000)
    }

    @Test func aManualCheckInSaysManual() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        try h.runtime.debugFire(1)
        await h.settle()
        let info = try #require(trigger(h.lastPhase()))
        #expect(info["kind"] as? String == "manual")
        #expect(info["reason"] as? String == "debug scenario 1")
    }

    @Test func aScheduledCheckInSaysScheduled() async throws {
        let h = RuntimeHarness()
        try await h.startRealSession(intervalMin: 30)
        h.clock.advance(by: 1800)
        await h.settle()
        let last = try #require(h.lastPhase())
        #expect(last["phase"] as? String == "checkIn")
        let info = try #require(trigger(last))
        #expect(info["kind"] as? String == "scheduled")
        #expect(info["reason"] as? String == "scheduled check-in")
    }

    @Test func aTriggerFromTheMotionSourceCarriesItsReason() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        await h.waitUntil { h.motion.triggerSubscriberCount > 0 }
        h.motion.fireTrigger(.stillness, reason: "still 31 s", at: h.clock.now)
        await h.waitUntil { h.phases().last == "checkIn" }
        let info = try #require(trigger(h.lastPhase()))
        #expect(info["kind"] as? String == "stillness")
        #expect(info["reason"] as? String == "still 31 s")
    }

    @Test func theTriggerStaysThroughTheLadderAndTheEscalation() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        try h.runtime.debugFire(2)
        await h.advance(SessionTimings.demo.deadline + 5)
        #expect(h.phases().last == "escalated")
        let checkIns = h.payloads(.onPhase).filter { ["checkIn", "escalated"].contains($0["phase"] as? String) }
        #expect(checkIns.count >= 4)
        for payload in checkIns { #expect(trigger(payload)?["kind"] as? String == "fall") }
        let snapshotPhase = try #require(h.runtime.snapshot()["phase"] as? [String: Any?])
        #expect(trigger(snapshotPhase)?["kind"] as? String == "fall")
    }

    @Test func aSecondTriggerDuringAnOpenCheckInDoesNotReplaceIt() async throws {
        let h = RuntimeHarness()
        try await h.startDemoSession()
        try h.runtime.debugFire(2)
        await h.settle()
        try h.runtime.debugFire(1)
        await h.advance(SessionTimings.demo.whisper)
        #expect(h.lastPhase()?["stage"] as? String == "loud")
        #expect(trigger(h.lastPhase())?["kind"] as? String == "fall")
    }

    /// The duress rule: after a duress PIN the phase payload is exactly what a safe PIN gives.
    @Test func monitoringAndIdleCarryANullTriggerAndDuressMatchesSafe() async throws {
        var lastPayloads: [String: [String: Any?]] = [:]
        for kind in ["safe", "duress"] {
            let h = RuntimeHarness()
            try await h.startDemoSession()
            try h.runtime.debugFire(1)
            await h.advance(SessionTimings.demo.whisper + SessionTimings.demo.loud)
            #expect(h.lastPhase()?["stage"] as? String == "pinGate")
            try h.runtime.pinResult(kind)
            await h.settle()
            let last = try #require(h.lastPhase())
            #expect(last["phase"] as? String == "monitoring")
            #expect(last.keys.contains("trigger"))
            #expect(last["trigger"]! == nil)
            lastPayloads[kind] = last
        }
        #expect(lastPayloads["safe"]?.keys.sorted() == lastPayloads["duress"]?.keys.sorted())
        let idle = try #require(RuntimeHarness().runtime.snapshot()["phase"] as? [String: Any?])
        #expect(idle.keys.contains("trigger"))
        #expect(idle["trigger"]! == nil)
    }

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

    @Test func onAirPodsIsAnEvent() {
        #expect(RaveGuardRuntime.Event.allCases.last == .onAirPods)
    }
}

@Suite struct TriggerTrackingLogTests {
    @Test func parsesKindAndReason() throws {
        let at = Date(timeIntervalSince1970: 1_800_000_000)
        let info = try #require(TriggerTrackingLog.parse("fall: spike 3.1 g, head 70° sideways: still 12 s", at: at))
        #expect(info == CheckInTriggerInfo(kind: .fall, reason: "spike 3.1 g, head 70° sideways: still 12 s", at: at))
        #expect(info.modulePayload["at"] as? Double == 1_800_000_000_000)
    }

    @Test func ignoresDetailsItCannotRead() {
        #expect(TriggerTrackingLog.parse(nil, at: Date()) == nil)
        #expect(TriggerTrackingLog.parse("no separator", at: Date()) == nil)
        #expect(TriggerTrackingLog.parse("sneeze: achoo", at: Date()) == nil)
    }

    @Test func promotesOnlyTheTriggerThatOpensACheckInAndPassesEverythingOn() {
        let inner = MemoryLog()
        let log = TriggerTrackingLog(wrapping: inner)
        let at = Date(timeIntervalSince1970: 1_800_000_000)
        let event = { (kind: SessionEventKind, detail: String?) in SessionEvent(id: UUID(), at: at, kind: kind, detail: detail) }
        log.append(event(.trigger, "fall: spike"))
        #expect(log.current == nil)
        log.append(event(.checkInStarted, "fall"))
        #expect(log.current?.kind == .fall)
        log.append(event(.trigger, "stillness: still 31 s"))
        #expect(log.current?.kind == .fall)
        #expect(inner.events.count == 3)
        #expect(log.events.count == 3)
    }
}
