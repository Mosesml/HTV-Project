# VoicePrompter draft plan

Scope: Moses M6 / PRD C7 and HRG-6. Build a native SessionPrompter for the existing
check-in ladder, reusing M5 audio configuration. Keep the work isolated on
`feature/voice-prompter`; do not merge into main or replace the installed test app.

## Commit-sized steps

- [ ] Define quiet/loud prompt requests and a testable output boundary. Implement
  replacement, immediate cancellation, unavailable-route haptics and shutdown behavior.
- [ ] Add the iOS AVSpeechSynthesizer and notification-haptic output. Reuse the application
  audio session, require Bluetooth A2DP output, and stop on output loss/interruption.
- [ ] Inject VoicePrompter into the module's SessionManager. Cover stage transitions,
  cancellation, PIN-gate silence and module shutdown with native integration tests.
- [ ] Verify portable Swift behavior, the actual iOS compilation path, and app checks.
  Document physical-device checks and the draft's remaining limitations.
- [ ] Confirm the original checkout is on main with no VoicePrompter changes installed.

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
