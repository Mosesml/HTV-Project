import Testing
@testable import RaveGuardCore

@MainActor
private final class VoiceRuntimeHarness {
    let output = RecordingVoiceOutput()
    let harness: RuntimeHarness

    init(hasSpeechOutput: Bool = true) {
        output.acceptsSpeech = hasSpeechOutput
        harness = RuntimeHarness(prompter: VoicePrompter(output: output))
    }

    var prompts: [VoicePrompt] {
        output.events.compactMap { if case .speech(let prompt) = $0 { return prompt }; return nil }
    }
    var haptics: Int { output.events.filter { $0 == .haptic }.count }

    func startCheckIn() async throws {
        try await harness.startDemoSession()
        try harness.runtime.debugFire(1)
        await harness.settle()
    }
}

@MainActor
@Suite struct RuntimeVoicePromptTests {
    @Test func ladderSpeaksQuietThenLoudAndStopsAtThePINGate() async throws {
        let h = VoiceRuntimeHarness()
        try await h.startCheckIn()
        #expect(h.prompts == [.whisper])
        #expect(h.haptics == 0)
        await h.harness.advance(10)
        #expect(h.prompts == [.whisper, .loud])
        #expect(h.haptics == 1)
        #expect(h.harness.runtime.hearingState.roomDb != nil)
        await h.harness.advance(10)
        #expect(h.harness.runtime.session.phase == .checkIn(.pinGate, stageEndsAt: h.harness.clock.now.addingTimeInterval(15)))
        #expect(h.output.events.last == .stop)
        await h.harness.advance(15)
        #expect(h.prompts == [.whisper, .loud])
        #expect(h.output.events.last == .stop)
    }

    @Test(arguments: [0.0, 10.0])
    func tapCancelsSpeechAndItsFutureStages(after seconds: Double) async throws {
        let h = VoiceRuntimeHarness()
        try await h.startCheckIn()
        await h.harness.advance(seconds)
        let expectedPrompts = h.prompts
        h.harness.runtime.tapCancel()
        await h.harness.settle()
        #expect(h.output.events.last == .stop)
        #expect(h.harness.runtime.session.phase == .monitoring)
        await h.harness.advance(40)
        #expect(h.prompts == expectedPrompts)
    }

    @Test(arguments: [0.0, 10.0])
    func nodStreamCancelsEitherSpokenStage(after seconds: Double) async throws {
        let h = VoiceRuntimeHarness()
        try await h.startCheckIn()
        await h.harness.advance(seconds)
        #expect(h.harness.motion.fireNod(at: h.harness.clock.now))
        await h.harness.waitUntil { h.harness.runtime.session.phase == .monitoring }
        #expect(h.harness.runtime.session.phase == .monitoring)
        #expect(h.output.events.last == .stop)
    }

    @Test(arguments: ["safe", "duress"])
    func neitherPINOutcomeIntroducesAnAudibleCue(_ kind: String) async throws {
        let h = VoiceRuntimeHarness()
        try await h.startCheckIn()
        await h.harness.advance(20)
        let events = h.output.events
        try h.harness.runtime.pinResult(kind)
        await h.harness.settle()
        #expect(h.output.events == events + [.stop])
        #expect(h.harness.runtime.session.phase == .monitoring)
    }

    @Test func noHeadphonesKeepsBothStagesOnScreenWithHaptics() async throws {
        let h = VoiceRuntimeHarness(hasSpeechOutput: false)
        try await h.startCheckIn()
        await h.harness.advance(10)
        #expect(h.prompts.isEmpty)
        #expect(h.haptics == 2)
        #expect(h.harness.runtime.session.phase == .checkIn(.loud, stageEndsAt: h.harness.clock.now.addingTimeInterval(10)))
    }

    @Test func refusedStopDoesNotSilenceAnUnansweredCheckIn() async throws {
        let h = VoiceRuntimeHarness()
        try await h.startCheckIn()
        let events = h.output.events
        #expect(!h.harness.runtime.stopSession())
        #expect(h.output.events == events)
        #expect(h.harness.audio.deactivations == 0)
        await h.harness.advance(10)
        #expect(h.prompts == [.whisper, .loud])
    }

    @Test func runtimeShutdownSilencesPendingStageTimers() async throws {
        let h = VoiceRuntimeHarness()
        try await h.startCheckIn()
        h.harness.runtime.shutdown()
        let events = h.output.events
        #expect(events.last == .stop)
        await h.harness.advance(20)
        #expect(h.output.events == events)
        #expect(h.harness.audio.deactivations == 1)
    }
}
