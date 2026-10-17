import Foundation

/// M6 / C7. Relative utterance volumes; neither value represents measured in-ear dB.
enum VoicePrompt: Equatable, Sendable {
    case whisper, loud

    var text: String {
        switch self {
        case .whisper: return "Nod if you're okay"
        case .loud: return "Are you okay? Nod, or tap Cancel"
        }
    }

    var volume: Float {
        switch self {
        case .whisper: return 0.25
        case .loud: return 0.85
        }
    }
}

/// The platform owns synthesis, output-route checks and haptics. Policy stays testable
/// without playing audio on a developer's Mac or changing the shared audio session.
@MainActor
protocol VoicePromptOutput: AnyObject {
    var onOutputUnavailable: (() -> Void)? { get set }
    var onSpeechFinished: ((UUID) -> Void)? { get set }
    /// True if speech was accepted on the intended output; false falls back to a haptic.
    func speak(_ prompt: VoicePrompt, requestID: UUID) -> Bool
    func stopSpeech()
    func warningHaptic()
}
