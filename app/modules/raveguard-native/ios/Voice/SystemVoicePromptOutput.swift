#if os(iOS)
import AVFoundation
import UIKit
import os

/// iOS output for M6. M5 owns category, input selection and activation. Speech must
/// use that same session so it does not replace phone-mic/A2DP routing with HFP.
@MainActor
final class SystemVoicePromptOutput: VoicePromptOutput {
    var onOutputUnavailable: (() -> Void)?

    private let session = AVAudioSession.sharedInstance()
    private let synthesizer = AVSpeechSynthesizer()
    private let haptics = UINotificationFeedbackGenerator()
    private let log = Logger(subsystem: "com.raveguard.native", category: "voice")
    private var isInterrupted = false
    private var observers: [NSObjectProtocol] = []

    init() {
        synthesizer.usesApplicationAudioSession = true
        observers = [
            observe(AVAudioSession.routeChangeNotification) { output, _ in
                if !output.hasA2DPOutput { output.outputUnavailable() }
            },
            observe(AVAudioSession.interruptionNotification) { output, notification in
                let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
                guard let raw, let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
                switch type {
                case .began:
                    output.isInterrupted = true
                    output.outputUnavailable()
                case .ended:
                    // The session owns reactivation. Never resume an old utterance.
                    output.isInterrupted = false
                @unknown default:
                    output.isInterrupted = true
                    output.outputUnavailable()
                }
            },
        ]
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    func speak(_ prompt: VoicePrompt) -> Bool {
        // Recheck at the last moment: don't send a new utterance to the phone speaker,
        // receiver, AirPlay or the low-quality Bluetooth hands-free route.
        guard !isInterrupted, hasA2DPOutput else {
            log.notice("No A2DP speech output available; check-in uses screen and haptics")
            return false
        }
        let utterance = AVSpeechUtterance(string: prompt.text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.volume = prompt.volume
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        synthesizer.speak(utterance)
        return true
    }

    func stopSpeech() { synthesizer.stopSpeaking(at: .immediate) }

    func warningHaptic() {
        haptics.prepare()
        haptics.notificationOccurred(.warning)
    }

    private var hasA2DPOutput: Bool {
        let outputs = session.currentRoute.outputs
        return !outputs.isEmpty && outputs.allSatisfy { $0.portType == .bluetoothA2DP }
    }

    private func outputUnavailable() {
        // Halt even if the policy consumer has detached during module teardown.
        stopSpeech()
        onOutputUnavailable?()
    }

    private func observe(
        _ name: Notification.Name,
        _ handle: @escaping @MainActor @Sendable (SystemVoicePromptOutput, Notification) -> Void
    ) -> NSObjectProtocol {
        NotificationCenter.default.addObserver(forName: name, object: session, queue: .main) { [weak self] note in
            MainActor.assumeIsolated {
                guard let self else { return }
                handle(self, note)
            }
        }
    }
}
#endif
