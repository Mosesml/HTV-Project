# RaveGuard app

The Expo React Native app (Expo SDK 57, React Native 0.86, Expo Router, TypeScript). It runs as a **dev build** on your own iPhone. Expo Go won't work, because it can't load our native module.

## One-time setup

1. **Xcode 26.x.** We're on SDK 57 so that Macs still on macOS 15 (Sequoia) can build. Xcode 27 needs macOS 26 (Tahoe).
   - **macOS 15:** the App Store offers Xcode 27, which won't install. Download the newest Xcode 26.x from [developer.apple.com/download/all](https://developer.apple.com/download/all), unzip the `.xip` and drag Xcode into Applications.
   - **macOS 26:** Xcode 27 from the App Store should work too.

   Open Xcode once to accept the license and install the iOS platform, then point the command-line tools at it:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   xcodebuild -version   # post this in the team chat; we should all match
   ```
2. **CocoaPods.** `brew install cocoapods`
3. **Apple ID.** In Xcode → Settings → Accounts, sign in with your Apple ID. A free "Personal Team" is enough.
4. **iPhone.** Plug it in, tap Trust, then turn on Settings → Privacy & Security → Developer Mode (the phone restarts).
5. **Your local settings.** From the repo root:
   ```bash
   cd app
   cp .env.example .env.local   # then set RG_BUNDLE_SUFFIX to your name, e.g. moses
   npm install
   ```
   Your build gets its own bundle ID, `com.raveguard.<suffix>`, so the four free teams never clash. `RG_APPLE_TEAM_ID` is optional. Leave it empty and Expo picks your team from the keychain.

## Run it on your phone

```bash
cd app
npm run ios:device    # = npx expo run:ios --device; pick your iPhone from the list
```

The first build takes a few minutes. After that, `npm start` serves JavaScript changes to the installed app. You only need to rebuild with `npm run ios:device` when native code or `app.json` changes.

## Checks

```bash
npm test            # app config, native module wrapper, phase navigation, settings, setup flow, PIN rules, PIN gate, duress-identical cancel, check-in countdown, protection slider, the Alert screen and its demo-only Call, the no-emergency-number scan, the Debug panel's controls, and one test per screen
npm run typecheck
npm run lint
```

## Screens

Routes live in `src/app/` and stay thin; each re-exports a screen from `src/screens/`. `src/app/_layout.tsx` wraps one stack in `SessionStateProvider` (the native session's phase and escalation) and `PhaseNavigator`, which opens Check-in, PIN entry and Alert when the phase calls for them (rules and tests in `src/navigation/phaseNavigation.ts`).

| Route | Screen | Reached by |
| --- | --- | --- |
| `/` | Setup | App launch |
| `/session` | Active session | Start session on Setup |
| `/check-in` | Check-in | A check-in starting (`onPhase` `checkIn`) |
| `/pin` | PIN entry | The PIN gate stage, or Enter PIN on Alert |
| `/alert` | Alert | `escalated` or `sos` |
| `/debug` | Debug | The Debug button on Setup and Active session |

Screen tests render the real route tree with `renderApp()` from `test-utils/renderApp.tsx`; `jest.setup.ts` swaps the Swift module for `modules/raveguard-native/src/mock.ts` in every test, `expo-file-system` for the in-memory `test-utils/fakeFileSystem.ts`, `expo-secure-store` for the in-memory Keychain in `test-utils/fakeSecureStore.ts` (reach it with `fakeSecureStore()`), and `expo-crypto` for Node's random bytes, UUIDs and SHA-256 (`test-utils/fakeCrypto.ts`), and `expo-haptics` for a recorder (`test-utils/fakeHaptics.ts`, reach it with `fakeHaptics()`).

## Settings

`src/settings/` stores the wearer's settings (K4): the module's `Settings` type, saved as JSON in `raveguard-settings.json` in the app's document directory (`expo-file-system`). PINs are not stored here (K6 keeps salted hashes in `expo-secure-store`).

| File | What it does |
| --- | --- |
| `SettingsProvider.tsx` | Loads the file once at launch; `useSettings()` gives `settings`, `isLoaded`, `problem`, `save(next)` and `reset()` |
| `settingsStore.ts` | `loadSettings` (never throws: a missing or damaged file gives the defaults plus a `problem`), `saveSettings`, `applySettings` (validate, save, then `configure()`) |
| `validateSettings.ts` | The same rules Swift's `ModuleSettings` applies, plus length limits and recipients kept in texting order; returns every issue with its path |
| `recipients.ts` | Add, update, remove, move and set permissions, returning new settings with `order` renumbered; ids from `expo-crypto`'s `randomUUID()` |
| `settingsStorage.ts` | The file (written to a temp file, then moved into place) and an in-memory storage for tests |

Settings reach Swift through `configure()` when they are saved and right before Start session, never just because the app launched: `configure()` during a running session reschedules the next check-in.

## Setup flow and PINs

Setup (`src/screens/SetupScreen.tsx`, K5) opens a one-page form when nothing is saved: your name, Contact 1, Contact 2 and venue staff with four permission switches each, the check-in interval, the loudness target, a self-description and both PINs. Once saved it shows a summary with Start session and Edit setup (off while a session runs).

| File | What it does |
| --- | --- |
| `src/setup/setupDraft.ts` | The form's state and `checkSetup`, which builds the settings and PINs or gives one message per field |
| `src/setup/setupRows.ts` | Recipient rows (add, move up, remove, permissions) and the starter permissions: Contact 1 sees everything, Contact 2 gets the defaults, venue staff see location |
| `src/setup/SetupForm.tsx`, `RecipientCard.tsx`, `PinFields.tsx`, `SetupSummary.tsx` | The form and its parts |
| `src/pin/pinRules.ts` | 4 to 8 digits each, and the two PINs must differ |
| `src/pin/pinStore.ts` | The `PinStore` interface (`hasPins`, `setPins`, `verify`, `clearPins`) and an in-memory stand-in for tests |
| `src/pin/securePinStore.ts` | The app's store (K6): both PINs as salted SHA-256 hashes in one `expo-secure-store` Keychain item (`raveguard.pins`, this device only); `verify` returns `safe`, `duress` or `wrong` |
| `src/pin/pinHash.ts` | 16-byte random salts, SHA-256 of `salt:pin` with `expo-crypto`, and a constant-time compare |
| `src/pin/PinStoreProvider.tsx` | `usePins()`; `appPinStore()` is the store the app uses (the secure one) |

## PIN gate

The PIN entry screen (`src/screens/PinEntryScreen.tsx`, K6) checks the entry with `usePins().store.verify(entry)` and sends the result to Swift with `pinResult`. Safe and duress share one code path to "Cancelled. Stay safe." and `pinResult` is not awaited (the duress rule). Every wrong entry is sent as `wrong`; Swift counts them and fires the escalation on the third. If the Keychain can't be read, the screen says "Couldn't check your PIN. Try again." and sends nothing, so it isn't a strike. Plain PINs are never stored, and `verify` hashes every entry under both salts so safe, duress and wrong take the same work.

After a correct PIN the screen runs one code path for both PINs (`src/pin/useCancelSequence.ts`, K9): `pinResult` goes out without being awaited, one success haptic plays (`expo-haptics`), "Cancelling…" shows for a fixed 600 ms, then "Cancelled. Stay safe." with Done. The PIN kind is passed straight to Swift and never kept in state, so nothing on screen can differ; `__tests__/screens/DuressCancelFrames.test.tsx` records both PINs at 60 fps and compares every frame.

| File | What it does |
| --- | --- |
| `src/pin/cancelSequence.ts` | `CANCELLING_MS = 600`, `CANCEL_HAPTIC` (success) and the step type |
| `src/pin/useCancelSequence.ts` | `startCancel(kind)`: sends `pinResult`, plays the haptic, shows "Cancelling…", then "Cancelled" after 600 ms; only the first call counts; clears its timer on unmount |
| `src/pin/pinFeedback.ts` | Fire-and-forget `sendPinResult` and `playCancelHaptic`; failures are swallowed so they can't show |
| `src/pin/CancelView.tsx` | "Cancelling…" and "Cancelled. Stay safe." + Done; it is never told which PIN was entered |

iOS keeps Keychain items after the app is deleted, so a reinstall still has the old PINs (Setup says "Leave both PINs blank to keep the ones you set."). Debug → Reset settings clears them.

## Check-in

The Check-in screen (`src/screens/CheckInScreen.tsx`, K7) is full screen and dark: "Are you okay?", the stage ("Step 1 of 3: Whisper", then Loud, then PIN gate), a countdown ring and one 120 pt, full-width Cancel at the bottom that calls `tapCancel()`. At the PIN gate the button becomes Enter PIN, since Swift ignores `tapCancel` there (PhaseNavigator normally opens PIN entry first).

| File | What it does |
| --- | --- |
| `src/checkIn/countdown.ts` | `stageCountdown(endsAt, startedAt, now)` gives seconds left and the share of the stage left; `litTicks` turns that into lit ticks |
| `src/checkIn/stages.ts` | Step, name, hint, ring color and whether Cancel works, per stage |
| `src/checkIn/CountdownRing.tsx` | 60 plain-`View` ticks around the seconds left (no SVG package, so no rebuild); VoiceOver reads it as one progress bar |
| `src/checkIn/CheckInView.tsx` | The layout, presentational |
| `src/session/phaseState.ts` | `seePhase`: SessionStateProvider stamps when each phase step was first seen (`phaseSeenAt`), which is where the ring starts, since `onPhase` only carries the stage's end |

## Active session

The Active session screen (`src/screens/SessionScreen.tsx`, K8) shows room dB and the sound dose (estimate) from `onHearing` ("—" while they're null: outside demo mode until the audio session can record, see Automatic protection), the motion state from `onMotion`, the next check-in from the snapshot, the manual protection slider and a 120 pt Stop. Stop that Swift refuses (a check-in or alert is open) says so and stays put.

| File | What it does |
| --- | --- |
| `src/activeSession/ProtectionControl.tsx` | The 0–100 slider (`@react-native-community/slider`, a native package) with the level `onNoise` reports, the AirPods mode (Adaptive below 70, Noise Cancellation from 70) and the backend; VoiceOver reads "55 points" |
| `src/activeSession/useProtectionLevel.ts` | Follows `onNoise` and the snapshot, and sends the wearer's level to `setProtectionLevel()` |
| `src/activeSession/levelSender.ts` | One `setProtectionLevel` call in flight at a time; levels pushed meanwhile collapse into the newest, so a drag always ends on its last level |
| `src/activeSession/protectionState.ts` | The confirmed level versus the one the wearer just chose, so the thumb doesn't jump back mid-drag |
| `src/activeSession/readings.ts`, `ReadingTile.tsx` | Room dB, dose, motion and next check-in as text, and the tiles that show them |
| `src/session/useSessionReadings.ts` | `onHearing`, `onMotion` (re-renders only when the state changes) and the snapshot's `nextCheckInAt`, re-read on every phase change |


## Alert

The Alert screen (`src/screens/AlertScreen.tsx`, K10) opens on `escalated` and `sos`. It shows the escalation's state as a title and one status line ("Texted 1 of 3. Waiting for someone to acknowledge.", "Sam acknowledged at 01:43. Help is on the way.", red "SOS" when the phase is `sos` or the server sets `sosOpen`), one row per recipient with when they were texted and when they acknowledged, a Call button, and Enter PIN to cancel (or Back to session once it closes). Acks arrive through `onEscalation`, which Swift sends after each 3 s status poll, so an ack on a contact's page shows here within 5 s.

**Call never dials emergency services.** In demo mode it opens `tel:<teammatePhone>` (iOS asks before dialling); outside demo mode, or with no teammate number, it is off and says why. The teammate's number is set on the Debug screen (Save sample settings puts in a fictional one). `__tests__/alert/noEmergencyNumbers.test.ts` scans `src/`, the native module (JavaScript and Swift) and the app config for 911, 112, 999 and 000, and checks `src/alert/teammateCall.ts` is the only file with a `tel:` URL.

| File | What it does |
| --- | --- |
| `src/alert/alertModel.ts` | `summarizeAlert(phase, escalation)` (title, status line, tone, SOS, open) and `recipientRows` (texted and acknowledged times as local HH:MM, and what VoiceOver reads) |
| `src/alert/teammateCall.ts` | `callTarget(settings)`: the teammate in demo mode, nobody otherwise; `telUrl` only for a full E.164 number (8 to 15 digits, so never a short code); `startCall` through React Native's `Linking` |
| `src/alert/AlertView.tsx`, `RecipientRow.tsx`, `CallPanel.tsx` | The layout, presentational |
| `src/debug/TeammatePhoneField.tsx` | The teammate's number on the Debug screen, saved through `useSettings().save` |

## Debug panel

The Debug screen (`src/screens/DebugScreen.tsx`, K11) is where the demo is driven from: the raw phase, a live motion readout, Start session (with the saved timings) / Tap Cancel / Stop session, one button per acceptance scenario (`debugFire(1–7)`), the demo/real timing toggle, the noise backend picker, "Simulate offline", and K4's and K10's settings tools. From idle a scenario button first sends the saved settings through `configure()`, so the session Swift starts uses them; while a check-in or alert is open the buttons are off, because Swift ignores a trigger then.

| File | What it does |
| --- | --- |
| `src/debug/scenarios.ts` | The seven scenarios with their PRD names, the trigger Swift fires (a fall for 2, 5 and 7) and what to do next; when they may fire, and when settings go first |
| `src/debug/ScenarioButtons.tsx` | The seven buttons and their hints, presentational |
| `src/debug/MotionReadout.tsx` | Subscribes to `onMotion` itself (10 Hz) so only it re-renders: state, pitch, roll, g and a readout count |
| `src/debug/DemoToggle.tsx` | The demo/real switch; the screen saves it through `useSettings().save`, which calls `configure()` |
| `src/debug/NoiseBackendPicker.tsx`, `useNoiseState.ts` | Shortcuts or Off (the Linux bridge is cut) through `setNoiseBackend`, showing what `onNoise` reports |
| `src/debug/OfflineSwitch.tsx`, `useSimulatedOffline.ts` | `debugSetOffline`, showing the snapshot's `simulatedOffline` (re-read on every phase change), so scenario 4 going offline and Stop turning it off both show |
| `src/debug/useDebugRunner.ts` | The panel's one error line and one notice line |
| `src/debug/TeammatePhoneField.tsx` | The teammate's number the demo SOS call rings (K10) |

- `ios/` and `android/` are generated by `expo prebuild` and git-ignored. Never edit them. Native settings go in `app.json`, and our Swift goes in `modules/raveguard-native/ios/` (see WORK_ORDER.md for which folders are yours).
- Add packages with `npx expo install <pkg>`, not `npm install <pkg>`, so versions match SDK 57.
- Don't add `expo-av` or `expo-audio`. They configure the audio session themselves, which would undo Moses's audio setup (M5).

## Automatic protection

Backlog BL1. Swift sets the protection level from the room's loudness and tracks the sound dose, because it has to keep going with the phone locked (the loop itself is described in `modules/raveguard-native/README.md`). Every session starts automatic. The Active Session screen offers Auto and Manual; moving the slider also switches to manual, and Auto hands protection back to Swift's loop. Demo mode reads a canned bar-to-club loudness trace; real sessions activate Moses's M5 audio session and meter the built-in mic, showing "—" until permission and a valid input route are available. The Shorts backend routes the level policy to user-created Adaptive/Noise Cancellation shortcuts and accepts their `raveguard://` callbacks. Mic calibration remains a device task.

| File | What it does |
| --- | --- |
| `src/hearing/useAutoProtection.ts` | Follows `onHearing` and the snapshot; `setAuto(on)` calls `setProtectionMode`, and the mode shown is the one Swift reports back |
| `src/hearing/hearingModel.ts` | `summarizeHearing`: mode label and hint, room dB, dose (estimate), the dose band (under 50%, 50–100%, over 100% of the daily allowance) and one VoiceOver sentence |

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Untrusted Developer" when opening the app | Settings → General → VPN & Device Management → your Apple ID → Trust |
| App stops opening after 7 days | Free-team profiles expire weekly. Run `npm run ios:device` again |
| "Maximum number of apps" error | Free teams can sideload 3 apps per device. Delete an old sideloaded app |
| `RG_BUNDLE_SUFFIX must be set…` | You skipped step 5 above |
| Signing error mentioning a bundle ID that's taken | Another team already used that suffix. Pick a different `RG_BUNDLE_SUFFIX` |
