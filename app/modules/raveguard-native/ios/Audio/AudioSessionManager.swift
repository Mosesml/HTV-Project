import Foundation
#if os(iOS)
import AVFoundation
#endif

@MainActor
protocol AudioSessionManaging: AnyObject {
    func activateForMonitoring()
    func deactivateAfterMonitoring()
}

/// M5: reserve the iPhone mic for room metering while preserving high-quality AirPods output.
/// This intentionally does not use `.allowBluetooth`, which would route calls over HFP.
@MainActor
final class SystemAudioSessionManager: AudioSessionManaging {
    #if os(iOS)
    private let session = AVAudioSession.sharedInstance()
    #endif

    func activateForMonitoring() {
        #if os(iOS)
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetoothA2DP])
            // iOS otherwise suppresses the check-in's haptic while mic metering is active.
            try session.setAllowHapticsAndSystemSoundsDuringRecording(true)
            if let builtInMic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
                try session.setPreferredInput(builtInMic)
            }
            try session.setActive(true)
        } catch {
            NSLog("RaveGuard could not activate microphone audio session: %@", error.localizedDescription)
        }
        #endif
    }

    func deactivateAfterMonitoring() {
        #if os(iOS)
        do {
            try session.setActive(false, options: [.notifyOthersOnDeactivation])
        } catch {
            NSLog("RaveGuard could not deactivate audio session: %@", error.localizedDescription)
        }
        #endif
    }
}
