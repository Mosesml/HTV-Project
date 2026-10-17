import Foundation
import Testing
@testable import RaveGuardCore

/// J12 short of a phone: scenarios 1, 2 and 5 through the module's runtime with every real
/// piece that runs off-device — `SessionManager`, Moses's `VoicePrompter` (recording its
/// output instead of speaking), Andy's `FakeEscalationService` — driven the way JavaScript
/// drives it (`configure`, `debugFire`, `tapCancel`) plus a nod from the motion source.
@MainActor
@Suite struct OfflineStackScenarioTests {

    final class SharedTime: @unchecked Sendable {
        private let lock = NSLock()
        private var value: Date
        init(_ d: Date) { value = d }
        var now: Date { lock.lock(); defer { lock.unlock() }; return value }
        func set(_ d: Date) { lock.lock(); value = d; lock.unlock() }
    }

    @MainActor
    final class Stack {
        let clock = ManualSessionClock()
        let time: SharedTime
        let fake: FakeEscalationService
        let voice = RecordingVoiceOutput()
        let motion = FakeMotionSource()
        let sink = EventSink()
        let runtime: RaveGuardRuntime
        let ids = (0..<3).map { _ in UUID() }

        init() {
            time = SharedTime(clock.now)
            let t = time
            fake = FakeEscalationService(clock: { t.now })
            runtime = RaveGuardRuntime(clock: clock, escalation: fake, motion: motion, log: MemoryLog(),
                                       audioSession: RecordingAudioSession(),
                                       prompter: VoicePrompter(output: voice),
                                       emit: { [sink] in sink.append($0, $1) })
        }

        func start() async throws {
            let names = ["Sam", "Riley", "Front desk"]
            let recipients: [[String: Any]] = ids.enumerated().map { i, id in
                ["id": id.uuidString, "name": names[i], "phoneE164": "+1555555010\(i)",
                 "kind": i == 2 ? "venueStaff" : "contact", "order": i,
                 "permissions": ["receiveAlerts": true, "seeLocation": i != 1, "seeFullBrief": i == 0,
                                 "canResolve": true]]
            }
            try runtime.configure(ModuleSettingsTests.settings(["recipients": recipients]))
            runtime.startSession()
            await runtime.session.settle()
        }

        func advance(_ seconds: TimeInterval) async {
            var left = seconds
            while left > 0 {
                let step = min(1, left)
                clock.advance(by: step)
                time.set(clock.now)
                left -= step
                await runtime.session.settle()
            }
        }

        func waitUntil(_ condition: () -> Bool) async {
            for _ in 0..<500 where !condition() { await Task.yield() }
        }

        var phase: SessionPhase { runtime.session.phase }
        var spoken: [VoicePrompt] {
            voice.events.compactMap { if case .speech(let p) = $0 { return p }; return nil }
        }
        var escalationId: String? {
            sink.events.filter { $0.0 == .onPhase }.compactMap { $0.1["escalationId"] as? String }
                .last { !$0.isEmpty }
        }
        var escalations: [[String: Any?]] { sink.events.filter { $0.0 == .onEscalation }.map(\.1) }
    }

    @Test func scenario1WhisperThenNodStopsThePromptAndCancels() async throws {
        let s = Stack()
        try await s.start()
        try s.runtime.debugFire(1)
        await s.runtime.session.settle()
        #expect(s.spoken == [.whisper])
        await s.advance(4)
        #expect(s.motion.fireNod(at: s.clock.now))
        await s.waitUntil { s.phase == .monitoring }
        #expect(s.phase == .monitoring)
        #expect(s.voice.events.last == .stop)          // prompt stops on the nod, no clock time passes
        await s.advance(120)
        #expect(s.spoken == [.whisper])                  // no loud prompt afterwards
        #expect(s.escalations.isEmpty)
    }

    @Test func scenario2NoAnswerSpeaksBothPromptsThenNotifiesContact1() async throws {
        let s = Stack()
        try await s.start()
        try s.runtime.debugFire(2)
        await s.runtime.session.settle()
        await s.advance(10)
        #expect(s.spoken == [.whisper, .loud])
        #expect(s.voice.events.filter { $0 == .haptic }.count == 1)
        await s.advance(10)
        #expect(s.voice.events.last == .stop)           // silent PIN gate
        await s.advance(15 + 3)
        guard case let .escalated(id) = s.phase else { Issue.record("not escalated: \(s.phase)"); return }
        let status = try await s.fake.status(id)
        #expect(status.recipients.first { $0.notifiedAt != nil }?.name == "Sam")
        #expect(!s.escalations.isEmpty)
        #expect(s.spoken == [.whisper, .loud])
    }

    @Test func scenario5UnacknowledgedChainEndsInSOS() async throws {
        let s = Stack()
        try await s.start()
        try s.runtime.debugFire(5)
        await s.runtime.session.settle()
        await s.advance(93)
        #expect(s.phase != .sos)
        await s.advance(4)
        #expect(s.phase == .sos)
        let last = try #require(s.escalations.last)
        #expect(last["sosOpen"] as? Bool == true)
    }

    @Test func scenario5AcknowledgedByContact1StopsTheChain() async throws {
        let s = Stack()
        try await s.start()
        try s.runtime.debugFire(5)
        await s.runtime.session.settle()
        await s.advance(40)
        let id = try #require(s.escalationId)
        try await s.fake.acknowledge(id, recipientID: s.ids[0])
        await s.advance(80)
        #expect(s.phase == .escalated(escalationId: id))
        try await s.fake.resolve(id, recipientID: s.ids[0])
        await s.advance(4)
        #expect(s.phase == .monitoring)
    }
}
