import Testing
@testable import RaveGuardCore

@MainActor
final class RecordingVoiceOutput: VoicePromptOutput {
    enum Event: Equatable {
        case stop, speech(VoicePrompt), haptic
    }
    var onOutputUnavailable: (() -> Void)?
    var acceptsSpeech = true
    private(set) var events: [Event] = []

    func speak(_ prompt: VoicePrompt) -> Bool {
        guard acceptsSpeech else { return false }
        events.append(.speech(prompt))
        return true
    }
    func stopSpeech() { events.append(.stop) }
    func warningHaptic() { events.append(.haptic) }
    func loseOutput() {
        acceptsSpeech = false
        onOutputUnavailable?()
    }
}

@MainActor
@Suite struct VoicePrompterTests {
    @Test func louderStageReplacesQuietSpeechAndAddsOneHaptic() {
        let output = RecordingVoiceOutput()
        let voice = VoicePrompter(output: output)
        voice.whisper()
        voice.loud()
        #expect(output.events == [.stop, .speech(.whisper), .stop, .speech(.loud), .haptic])
        #expect(VoicePrompt.whisper.volume < VoicePrompt.loud.volume)
        #expect(VoicePrompt.whisper.text == "Nod if you're okay")
        #expect(VoicePrompt.loud.text == "Are you okay? Nod, or tap Cancel")
    }

    @Test func stopInterruptsWithoutAHapticOrLaterReplay() {
        let output = RecordingVoiceOutput()
        let voice = VoicePrompter(output: output)
        voice.whisper()
        voice.stop()
        output.loseOutput()
        #expect(output.events == [.stop, .speech(.whisper), .stop])
    }

    @Test func missingOutputFallsBackToExactlyOneHapticPerStage() {
        let output = RecordingVoiceOutput()
        output.acceptsSpeech = false
        let voice = VoicePrompter(output: output)
        voice.whisper()
        voice.loud()
        #expect(output.events == [.stop, .haptic, .stop, .haptic])
    }

    @Test func losingOutputStopsSpeechAndWarnsOnceUntilTheNextStage() {
        let output = RecordingVoiceOutput()
        let voice = VoicePrompter(output: output)
        voice.whisper()
        output.loseOutput()
        output.loseOutput()
        #expect(output.events == [.stop, .speech(.whisper), .stop, .haptic])
        output.acceptsSpeech = true
        #expect(output.events.count == 4)  // Reconnection never replays the quiet stage.
        voice.loud()
        #expect(output.events.suffix(3) == [.stop, .speech(.loud), .haptic])
    }

    @Test func routeChangesWhileIdleDoNotProduceAnAlert() {
        let output = RecordingVoiceOutput()
        let voice = VoicePrompter(output: output)
        output.loseOutput()
        #expect(output.events.isEmpty)
        voice.stop()
        #expect(output.events == [.stop])
    }

    @Test func shutdownDisablesLateTimersAndBufferedRouteNotifications() {
        let output = RecordingVoiceOutput()
        let voice = VoicePrompter(output: output)
        voice.whisper()
        let bufferedRouteCallback = output.onOutputUnavailable
        voice.shutdown()
        voice.whisper()
        voice.loud()
        bufferedRouteCallback?()
        voice.shutdown()
        #expect(output.events == [.stop, .speech(.whisper), .stop])
        #expect(output.onOutputUnavailable == nil)
    }
}
