# VoicePrompter draft plan

Scope: Moses M6 / PRD C7 and HRG-6. Build a native SessionPrompter for the existing
check-in ladder, reusing M5 audio configuration. Keep the work isolated on
`feature/voice-prompter`; do not merge into main or replace the installed test app.

## Commit-sized steps

- [x] Define quiet/loud prompt requests and a testable output boundary. Implement
  replacement, immediate cancellation, unavailable-route haptics and shutdown behavior.
- [x] Add the iOS AVSpeechSynthesizer and notification-haptic output. Reuse the application
  audio session, require Bluetooth A2DP output, and stop on output loss/interruption.
- [x] Inject VoicePrompter into the module's SessionManager. Cover stage transitions,
  cancellation, PIN-gate silence and module shutdown with native integration tests.
- [x] Verify portable Swift behavior, the actual iOS compilation path, and app checks.
  Document physical-device checks and the draft's remaining limitations.
- [x] Confirm the original checkout is on main with no VoicePrompter changes installed.

## Behavior decisions

- Quiet: "Nod if you're okay" at a lower per-utterance volume.
- Loud: "Are you okay? Nod, or tap Cancel" at a higher per-utterance volume, plus a haptic.
- Volumes are relative synthesis values, not calibrated sound-pressure levels. Do not
  change the user's system volume or M5's category/input route.
- A new stage replaces previous speech. Stop cancels immediately. Reconnecting or ending
  an interruption must not replay an old prompt.
- Without A2DP output, use haptics and the existing on-screen check-in. Do not initiate
  speech on the phone speaker. Route-loss timing still requires device validation.
- Keep timers, policy and prompt calls native; add no Expo speech/audio dependency or
  new JavaScript API. Preserve existing safe/duress UI behavior.
- Module shutdown permanently disables that prompter instance so a late timer cannot
  speak after reload. The next runtime receives a fresh instance.

## Verification

Use injected outputs and the manual session clock to verify replacement, both prompt
stages, haptics, cancellation by tap/nod/PIN, PIN-gate silence, and no speech after shutdown.
Type-check iOS-only adapters against the installed simulator SDK. Run app lint/typecheck
and relevant native suites. Automated results do not establish actual AirPods routing,
perceived volume, mic continuity, background behavior or privacy during route changes.

Physical checks after review: connected AirPods, device volume/voice availability,
quiet-to-loud ordering, cancellation within one second, phone mic continuity, disconnect
and reconnect, interruptions, and five minutes locked. The draft must stay off main
until those checks and review are complete.

## Progress

- Step 1: six native policy tests pass, covering stage replacement, manual stop,
  unavailable-output fallback, route loss/reconnection, idle notifications and shutdown.
- Step 2: the entire core type-checks against the iOS Simulator SDK. Speech uses the
  application audio session, checks for A2DP-only outputs, and cancels for route loss
  or interruptions. M5 now opts in to haptics during mic recording. Audibility and
  actual route behavior remain device-only checks.
- Step 3: 13 prompt/prompt-integration tests pass (including parameterized nod, tap and
  PIN cases). They cover the real session ladder through the injected output, meter
  updates during the ladder, silence at the PIN gate, and late timers after shutdown.
  Integration testing caught a harmless late stop call after teardown; shutdown now
  makes every prompter entry point inert.
- Step 4 complete: all 227 native tests and all 566 app tests pass; app typecheck and
  lint also pass. The full isolated Xcode simulator build passed with the new Voice sources
  included in RaveGuardNative. It was not installed. The Voice README records physical
  acceptance checks and draft limitations; actual AirPods speech remains unverified.
- Step 5 complete: the original `/Users/moses/Moses/HTV-Project` checkout is still clean
  on `main` at `2d6534d`, preserving the existing AirPods test setup. Draft work, dependencies,
  CocoaPods files and build products are separate in the VoicePrompter checkout and
  `/private/tmp/RaveGuardVoiceDraftDerivedData`. No merge or push was performed.
