#if os(iOS)
import AVFoundation
import UIKit
import os

/// iOS output for M6. M5 owns category, input selection and activation. Speech must
/// use that same session so it does not replace phone-mic/A2DP routing with HFP.
@MainActor
final class SystemVoicePromptOutput: NSObject, VoicePromptOutput, AVSpeechSynthesizerDelegate {
    var onOutputUnavailable: (() -> Void)?
    var onSpeechFinished: ((UUID) -> Void)?

    private let session = AVAudioSession.sharedInstance()
    private let synthesizer = AVSpeechSynthesizer()
    private let haptics = UINotificationFeedbackGenerator()
    private let log = Logger(subsystem: "com.raveguard.native", category: "voice")
    private var isInterrupted = false
    private var activeUtteranceID: ObjectIdentifier?
    private var activeRequestID: UUID?
    private var observers: [NSObjectProtocol] = []

    override init() {
        super.init()
        synthesizer.usesApplicationAudioSession = true
        synthesizer.delegate = self
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

    func speak(_ prompt: VoicePrompt, requestID: UUID) -> Bool {
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
        activeUtteranceID = ObjectIdentifier(utterance)
        activeRequestID = requestID
        synthesizer.speak(utterance)
        return true
    }

    func stopSpeech() {
        // Clear before stopSpeaking; its didCancel callback can arrive after a new stage.
        activeUtteranceID = nil
        activeRequestID = nil
        synthesizer.stopSpeaking(at: .immediate)
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        Task { @MainActor [weak self] in self?.speechStarted(id) }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        Task { @MainActor [weak self] in self?.speechFinished(id) }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        Task { @MainActor [weak self] in self?.speechCancelled(id) }
    }

    func warningHaptic() {
        haptics.prepare()
        haptics.notificationOccurred(.warning)
    }

    private var hasA2DPOutput: Bool {
        let outputs = session.currentRoute.outputs
        return !outputs.isEmpty && outputs.allSatisfy { $0.portType == .bluetoothA2DP }
    }

    private func speechStarted(_ id: ObjectIdentifier) {
        guard activeUtteranceID == id else { return }
        // A queued utterance may begin after its initial route check.
        if isInterrupted || !hasA2DPOutput { outputUnavailable() }
    }

    private func speechFinished(_ id: ObjectIdentifier) {
        guard activeUtteranceID == id, let requestID = activeRequestID else { return }
        activeUtteranceID = nil
        activeRequestID = nil
        onSpeechFinished?(requestID)
    }

    private func speechCancelled(_ id: ObjectIdentifier) {
        guard activeUtteranceID == id else { return }
        outputUnavailable()
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
