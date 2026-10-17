import Foundation

/// Native check-in prompts. Each stage replaces speech rather than queueing behind it.
/// A route loss interrupts the request; reconnecting never replays a stale prompt.
@MainActor
final class VoicePrompter: SessionPrompter {
    private let output: VoicePromptOutput
    private var hasSpeechRequest = false
    private var isShutdown = false

    init(output: VoicePromptOutput) {
        self.output = output
        output.onOutputUnavailable = { [weak self] in self?.outputUnavailable() }
    }

    func whisper() { present(.whisper) }
    func loud() { present(.loud) }

    func stop() {
        guard !isShutdown else { return }
        hasSpeechRequest = false
        output.stopSpeech()
    }

    /// Module teardown is permanent for this instance, including any late session timer.
    func shutdown() {
        guard !isShutdown else { return }
        stop()
        isShutdown = true
        output.onOutputUnavailable = nil
    }

    private func present(_ prompt: VoicePrompt) {
        guard !isShutdown else { return }
        stop()
        hasSpeechRequest = output.speak(prompt)
        if prompt == .loud || !hasSpeechRequest { output.warningHaptic() }
    }

    private func outputUnavailable() {
        guard !isShutdown, hasSpeechRequest else { return }
        stop()
        output.warningHaptic()
    }
}
