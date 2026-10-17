import Foundation

/// Native check-in prompts. Each stage replaces speech rather than queueing behind it.
/// A route loss interrupts the request; reconnecting never replays a stale prompt.
@MainActor
final class VoicePrompter: SessionPrompter {
    private let output: VoicePromptOutput
    private var activeRequestID: UUID?
    private var hasWarnedForStage = false
    private var isShutdown = false

    init(output: VoicePromptOutput) {
        self.output = output
        output.onOutputUnavailable = { [weak self] in self?.outputUnavailable() }
        output.onSpeechFinished = { [weak self] id in self?.speechFinished(id) }
    }

    func whisper() { present(.whisper) }
    func loud() { present(.loud) }

    func stop() {
        guard !isShutdown else { return }
        activeRequestID = nil
        hasWarnedForStage = false
        output.stopSpeech()
    }

    /// Module teardown is permanent for this instance, including any late session timer.
    func shutdown() {
        guard !isShutdown else { return }
        stop()
        isShutdown = true
        output.onOutputUnavailable = nil
        output.onSpeechFinished = nil
    }

    private func present(_ prompt: VoicePrompt) {
        guard !isShutdown else { return }
        stop()
        let id = UUID()
        activeRequestID = id
        let accepted = output.speak(prompt, requestID: id)
        if !accepted, activeRequestID == id { activeRequestID = nil }
        if prompt == .loud || !accepted { warnOnce() }
    }

    private func outputUnavailable() {
        guard !isShutdown, activeRequestID != nil else { return }
        activeRequestID = nil
        output.stopSpeech()
        warnOnce()
    }

    private func speechFinished(_ id: UUID) {
        guard !isShutdown, activeRequestID == id else { return }
        activeRequestID = nil
    }

    private func warnOnce() {
        guard !hasWarnedForStage else { return }
        hasWarnedForStage = true
        output.warningHaptic()
    }
}
