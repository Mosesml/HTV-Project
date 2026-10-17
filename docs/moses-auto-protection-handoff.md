# Automatic protection handoff

Verified locally on October 17, 2026 with Xcode 27.1 and the iPhone 16 Pro simulator
running iOS 18.6. The app uses Expo SDK 57 for its screens and a local Swift module
for hearing, audio, noise control and the session state machine.

## Implemented

- A one-second room-level source, dose estimate and eased 0–100 protection policy.
- A canned level trace for simulator/demo sessions and the phone mic for real sessions.
- Automatic/Manual session controls; moving the slider selects Manual.
- Shortcuts output: Adaptive below 70, full Noise Cancellation at 70 or above, with
  a 25-second dwell between requests.
- Shortcuts return URLs update the native controller without navigating away from the
  current screen. Success confirms the Shortcut completed, not acoustic attenuation.
- Stop/Off cancels queued switches and invalidates old callbacks. A Shortcut already
  handed to iOS cannot be recalled.
- A monitoring audio session using playAndRecord, built-in mic input and A2DP output.
  Bluetooth HFP is not enabled.

## Local verification

The missing app/server dependencies were restored from their existing lockfiles and
the generated iOS project and CocoaPods installation were refreshed.

| Check | Result |
| --- | --- |
| App Jest suite | 542 tests passed across 45 suites |
| Swift package suite | 202 tests passed across 25 suites |
| Server suite | 28 Node tests and 15 Vitest tests passed |
| TypeScript | Passed |
| Expo lint, without stale cache | Passed |
| Full Xcode simulator build, including RaveGuardNative | Passed |
| Simulator install | Passed; opening the Metro link awaits the iOS Open confirmation |
| Physical iPhone/AirPods, audio routing, locked-screen operation | Not yet verified |
| Live SMS delivery | Not yet verified; running server uses simulated delivery |

Useful commands from the repository:

```sh
cd app
npm ci --ignore-scripts
npm run typecheck
EXPO_NO_TELEMETRY=1 npm run lint -- --no-cache
npm test -- --runInBand
npx expo prebuild --platform ios
npm run ios:device
```

`app/.env.local` must set a personal `RG_BUNDLE_SUFFIX`; `RG_APPLE_TEAM_ID` is optional.
For Xcode, open `app/ios/RaveGuard.xcworkspace`. The `app/ios/` directory is generated
and ignored by Git. Swift tests run from `app/modules/raveguard-native/ios` with
`swift test`; server tests run from `server` with `npm test`.

## Next work

1. On the demo iPhone, connect AirPods and create/run the user Shortcuts named
   `RG Adaptive` and `RG Noise Cancellation`. Select Shortcuts in the app's Debug
   screen; the default backend is Off. Test both modes and the return path.
2. Calibrate the mic at the PRD's 70 and 95 dB points. The current calibration offset
   and mode attenuation values are placeholders, so the dose remains an estimate.
3. Validate built-in mic input, A2DP output, reconnects and a five-minute locked-screen run.
   Confirm the limits of launching Shortcuts while backgrounded or locked on the phone.
4. Implement M6 VoicePrompter and verify that prompts use AirPods while metering continues.
5. Complete J12: the app runtime still uses fake motion and escalation dependencies.
   Connect the real motion pipeline and Swift server client. Motion tests currently
   use synthetic recordings; the team still needs real labelled motion clips.
6. Complete the server's live delivery integration, contact pages, hosting, persistence
   and real SMS acceptance checks. Then run all seven PRD scenarios on the real stack.

Backend/session state and outstanding Shortcuts requests are not restored after process
termination. Add that recovery and a normal user-facing Shortcuts setup flow before
treating the current Debug-driven workflow as finished product behavior.
