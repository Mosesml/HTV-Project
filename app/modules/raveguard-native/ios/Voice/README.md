# VoicePrompter — M6 draft

This implementation is isolated on `feature/voice-prompter`. It is not merged into main
or installed over Moses's current AirPods test build.

## Behavior

`VoicePrompter` conforms to the existing native `SessionPrompter` protocol. The runtime
injects it into `SessionManager` on iOS; no screen, JavaScript timer or new module API
is involved. The session's existing transitions determine when prompts run.

| Transition | Behavior |
| --- | --- |
| Enter whisper | Replace previous speech with "Nod if you're okay", relative volume 0.25 |
| Enter loud | Replace previous speech with "Are you okay? Nod, or tap Cancel", volume 0.85; one warning haptic |
| Enter PIN gate, answer a check-in, or end the session | Stop speech immediately |
| No A2DP output when a stage starts | No speech request; one warning haptic and existing on-screen check-in |
| Output disappears or audio interruption begins | Stop current speech; warn if a prompt was active |
| Reconnect or interruption ends | Do not replay old speech; a later stage can request a fresh prompt |
| Module shutdown/reload | Stop and permanently disable this prompter instance, including late timers |

The quiet prompt uses ordinary system speech at a lower volume; it is not a specialized
whisper voice. These volumes do not set system volume or represent calibrated in-ear dB.
Safe and duress PIN outcomes have the same voice behavior and do not introduce a new cue.

## Audio ownership

`SystemVoicePromptOutput` uses `AVSpeechSynthesizer.usesApplicationAudioSession = true`.
It does not change category, activate another session, choose a Bluetooth mic, or alter
the user's volume. M5 still configures playAndRecord, built-in mic and A2DP. M5 also opts
in to system haptics during microphone recording.

New speech is allowed only when every current output port is Bluetooth A2DP. This rejects
the phone speaker/receiver, HFP, AirPlay and empty routes. A2DP is a transport check, not
an AirPods identity check: connect the intended AirPods and confirm the selected output.
Route-change handling requests an immediate stop; possible audible leakage during a
real route transition still needs physical-device validation.

Native policy tests inject `VoicePromptOutput` and play no sound on the Mac. They cover
replacement, fallback, stop, route loss and shutdown. Runtime tests drive the real session
with a manual clock, including nod/tap/PIN cancellation and the silent PIN gate.

## Before enabling this draft on the demo phone

1. Rebuild the native module after checking out the feature. Regenerate/install the iOS
   project so CocoaPods includes the new Voice sources; an OTA JavaScript reload is not enough.
2. Connect AirPods, confirm the iPhone's audio output and begin at a comfortable system volume.
   Trigger a check-in from Debug: demo whisper at 0 s, loud at 10 s, silent PIN gate at 20 s.
3. Verify the two relative volumes, intelligibility and loud-stage haptic. A configured
   speech request does not prove a system voice actually produced audible output.
4. Cancel with a nod/tap during both spoken stages. Audible speech should stop within the
   PRD's one-second acceptance window. Check both PIN outcomes for identical cues.
5. With Demo disabled, verify the built-in mic continues producing level/dose readings
   while speech plays, output stays high quality, and haptics occur during metering.
6. Disconnect AirPods mid-prompt, reconnect, and test an audio interruption. Verify there
   is no phone-speaker speech or stale prompt replay. Also test starting without AirPods.
7. Run a five-minute locked-screen session and test a foreground/background transition.
   Recording-capable configuration and automated tests alone do not prove iOS background behavior.

The draft does not automatically reactivate M5's audio session after an interruption,
repeat prompts, force device volume, or supply voice assets missing from a device. Resolve
any failed device checks before merging it into the AirPods test branch/main.

Apple references: [speech synthesis](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer),
[route changes](https://developer.apple.com/documentation/avfaudio/responding-to-audio-route-changes),
[recording-time haptics](https://developer.apple.com/documentation/avfaudio/avaudiosession/allowhapticsandsystemsoundsduringrecording).
