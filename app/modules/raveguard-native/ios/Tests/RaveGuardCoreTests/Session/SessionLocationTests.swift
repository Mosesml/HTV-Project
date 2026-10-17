import Foundation
import Testing
@testable import RaveGuardCore

/// Records every location request, and hands out fixes when the test says so.
@MainActor
final class FakeLocationSource: LocationSource {
    private(set) var calls: [String] = []
    private var pendingFixes: [@MainActor (GeoPoint?) -> Void] = []
    private var live: (@MainActor (GeoPoint) -> Void)?
    var isLive: Bool { live != nil }
    var fixRequests: Int { calls.filter { $0 == "requestFix" }.count }

    func beginSession() { calls.append("beginSession") }
    func endSession() { calls.append("endSession") }
    func requestFix(_ done: @escaping @MainActor (GeoPoint?) -> Void) { calls.append("requestFix"); pendingFixes.append(done) }
    func startUpdates(_ each: @escaping @MainActor (GeoPoint) -> Void) { calls.append("startUpdates"); live = each }
    func stopUpdates() { calls.append("stopUpdates"); live = nil }

    /// Answers every pending one-off fix request.
    func answerFix(_ fix: GeoPoint?) { let waiting = pendingFixes; pendingFixes = []; waiting.forEach { $0(fix) } }
    /// A live update, as if the wearer moved.
    func move(to fix: GeoPoint) { live?(fix) }
}

private func fix(_ lat: Double, _ lon: Double, at: Date) -> GeoPoint {
    GeoPoint(lat: lat, lon: lon, accuracyM: 12, at: at)
}

/// AN10 / PRV-2: one fix at check-in start, live updates only while escalated, none otherwise.
@MainActor
@Suite struct SessionLocationTests {

    @MainActor
    final class Harness {
        let clock = ManualSessionClock()
        let log = MemoryLog()
        let gps = FakeLocationSource()
        let server: ScriptedEscalationService
        let session: SessionManager

        init(demo: Bool = true) {
            let config = SessionManagerConfig(wearerName: "Alex", intervalMin: 30, demo: demo)
            server = ScriptedEscalationService(clock: clock, ackWindow: config.timings.ackWindow)
            session = SessionManager(config: config, clock: clock, escalation: server, log: log, location: gps)
        }

        func advance(_ seconds: TimeInterval) async {
            var left = seconds
            while left > 0 { let step = min(1, left); clock.advance(by: step); left -= step; await session.settle() }
        }
        func trigger() async {
            session.handleTrigger(MotionEvent(kind: .fall, at: clock.now, reason: "x", posture: nil))
            await session.settle()
        }
        var registered: BriefFacts? { server.escalations["esc1"]?.facts }
        var sentLocations: [GeoPoint?] { server.escalations["esc1"]?.updates.map(\.location) ?? [] }
    }

    @Test func noLocationIsEverAskedForWhileMonitoring() async {
        let h = Harness(demo: false)
        h.session.start()
        await h.advance(29 * 60)   // a long stretch of monitoring, short of the 30 min check-in
        #expect(h.gps.calls == ["beginSession"])
        #expect(!h.gps.isLive)
    }

    @Test func aCheckInAsksForOneFixAndSendsItWhenItArrives() async throws {
        let h = Harness()
        h.session.start(); await h.session.settle()
        await h.trigger()
        #expect(h.gps.fixRequests == 1)
        #expect(h.registered?.location == nil)          // register doesn't wait for GPS
        let here = fix(43.4723, -80.5449, at: h.clock.now)
        h.gps.answerFix(here)
        await h.session.settle()
        #expect(h.sentLocations.last == here)
        await h.advance(10)   // the loud stage's update carries it too
        #expect(h.sentLocations.last == here)
        #expect(!h.gps.isLive, "no live updates before escalation")
    }

    @Test func aFixThatBeatsRegisterIsSentOnceRegisterLands() async {
        let h = Harness()
        h.session.start(); await h.session.settle()
        h.session.handleTrigger(MotionEvent(kind: .fall, at: h.clock.now, reason: "x", posture: nil))
        let here = fix(43.47, -80.54, at: h.clock.now)
        h.gps.answerFix(here)                            // before register's reply is processed
        await h.session.settle()
        let last = h.registered?.location ?? h.sentLocations.last ?? nil
        #expect(last == here)
    }

    @Test func escalationStartsLiveUpdatesThatFollowTheWearerAtMostEvery15Seconds() async {
        let h = Harness()
        h.session.start(); await h.session.settle()
        await h.trigger()
        h.gps.answerFix(fix(43.4700, -80.5400, at: h.clock.now))
        await h.advance(35)
        #expect(h.gps.isLive)
        let before = h.sentLocations.count
        h.gps.move(to: fix(43.4710, -80.5410, at: h.clock.now))
        await h.session.settle()
        #expect(h.sentLocations.count == before + 1)
        h.gps.move(to: fix(43.4720, -80.5420, at: h.clock.now))   // too soon: held back
        h.gps.move(to: fix(43.4730, -80.5430, at: h.clock.now))
        await h.session.settle()
        #expect(h.sentLocations.count == before + 1)
        await h.advance(15)
        #expect(h.sentLocations.count == before + 2)
        #expect(h.sentLocations.last??.lat == 43.4730, "the newest fix wins")
    }

    @Test func resolvingStopsLiveUpdates() async {
        let h = Harness()
        h.session.start(); await h.session.settle()
        await h.trigger()
        await h.advance(40)
        #expect(h.gps.isLive)
        h.server.resolve("esc1")
        await h.advance(4)
        #expect(h.session.phase == .monitoring)
        #expect(!h.gps.isLive)
        h.gps.move(to: fix(1, 1, at: h.clock.now))       // a late callback goes nowhere
        await h.session.settle()
        #expect(h.sentLocations.allSatisfy { $0?.lat != 1 })
    }

    @Test func aSafeCancelNeverStartsLiveUpdatesAndALateFixIsDropped() async {
        let h = Harness()
        h.session.start(); await h.session.settle()
        await h.trigger()
        h.session.tapCancel()
        await h.session.settle()
        h.gps.answerFix(fix(43.47, -80.54, at: h.clock.now))
        await h.advance(60)
        #expect(!h.gps.calls.contains("startUpdates"))
        #expect(h.sentLocations.allSatisfy { $0 == nil })
    }

    @Test func duressKeepsSendingLocationSilentlyEvenAfterStop() async {
        let h = Harness()
        h.session.start(); await h.session.settle()
        await h.trigger()
        await h.advance(21)   // PIN gate
        h.session.pinResult(.duress)
        await h.session.settle()
        #expect(h.session.phase == .monitoring)
        #expect(h.gps.isLive, "a duress alert is when location matters most")
        #expect(h.session.stop())
        h.gps.move(to: fix(43.48, -80.53, at: h.clock.now))
        await h.session.settle()
        #expect(h.sentLocations.last??.lat == 43.48)
        #expect(!h.gps.calls.contains("endSession"))
        h.server.resolve("esc1")
        await h.advance(4)
        #expect(!h.gps.isLive)
        #expect(h.gps.calls.last == "endSession")
    }

    @Test func stopEndsTheLocationSessionAndANewCheckInStartsFresh() async {
        let h = Harness()
        h.session.start(); await h.session.settle()
        await h.trigger()
        h.gps.answerFix(fix(43.47, -80.54, at: h.clock.now))
        h.session.tapCancel()
        await h.session.settle()
        #expect(h.session.stop())
        #expect(h.gps.calls.last == "endSession")
        h.session.start(); await h.session.settle()
        await h.trigger()
        #expect(h.server.escalations["esc2"]?.facts.location == nil, "no fix carried over from before")
    }

    @Test func deniedOrNoSignalStillEscalatesWithoutALocation() async {
        let h = Harness()
        h.session.start(); await h.session.settle()
        await h.trigger()
        h.gps.answerFix(nil)
        await h.advance(40)
        #expect(h.session.phase == .escalated(escalationId: "esc1"))
        #expect(h.sentLocations.allSatisfy { $0 == nil })
    }
}
