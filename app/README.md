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
npm test            # app config, native module wrapper, phase navigation, settings, the setup steps, PIN rules, PIN gate, duress-identical cancel, check-in, protection slider and Automatic / Manual, Alert and SOS and their demo-only Call, the no-emergency-number scan, the Debug panel, the shared UI components, and every screen
npm run typecheck
npm run lint
```

`typecheck` uses expo-router's typed routes, which are generated into `.expo/types/` (git-ignored) when the dev server starts. After pulling new routes, run `npm start` once (or `npm run ios:device`) before `typecheck`, or it reports every new route as invalid.

## Screens

Every screen follows the redesign (`docs/design/README.md` and the mockups in `docs/design/screens/`): dark, built from the shared tokens and components in `src/ui/` (props and examples in `src/ui/README.md`). Fonts (Sora, Manrope, JetBrains Mono) load at startup in `src/ui/fonts.ts`; the splash screen stays up until they have.

Routes live in `src/app/` and stay thin; each re-exports a screen from `src/screens/`. `src/app/_layout.tsx` wraps one header-less stack in `SettingsProvider`, `PinStoreProvider`, `SessionStateProvider` (the native session's phase, its trigger, the escalation and the AirPods connection) and `PhaseNavigator`, which moves the wearer to the screen their phase calls for (rules and tests in `src/navigation/phaseNavigation.ts`). Each screen draws its own Back, Settings or Debug button. Check-in, the PIN gate, Alert and SOS can't be swiped away.

| Route | Screen (mockup) | Reached by |
| --- | --- | --- |
| `/` | Home (`Home.html`), or a redirect to Setup step 1 when nothing is saved (`src/navigation/HomeRoute.tsx`) | App launch; Stop on Active session |
| `/setup/contacts`, `/setup/permissions`, `/setup/session`, `/setup/pins` | Setup steps 1–4 (`Setup-1` to `Setup-4`) | First launch; Settings on Home |
| `/setup` | Redirects to step 1 | Old links |
| `/session` | Active session (`Active.html`) | `monitoring`: Start session on Home, a nod or "I'm okay", "Back to my session" |
| `/check-in` | Check-in, whisper and loud (`CheckIn-Whisper`, `CheckIn-Loud`): one component | `checkIn`, stage `whisper` or `loud` |
| `/pin` | PIN gate (`PIN-Gate`), then Cancelling… and Cancelled (`Cancelling`, `Cancelled`) in the same route (the duress rule) | Stage `pinGate`; "I'm okay now" on Alert and SOS |
| `/alert` | Alert (`Alert.html`) | `escalated` |
| `/sos` | SOS (`SOS.html`) | `sos` |
| `/debug` | Debug (`Debug.html`) | "Debug panel" on Home and Active session |

Screen tests render the real route tree with `renderApp()` from `test-utils/renderApp.tsx`; `jest.setup.ts` swaps the Swift module for `modules/raveguard-native/src/mock.ts` in every test, `expo-file-system` for the in-memory `test-utils/fakeFileSystem.ts`, `expo-secure-store` for the in-memory Keychain in `test-utils/fakeSecureStore.ts` (reach it with `fakeSecureStore()`), `expo-crypto` for Node's random bytes, UUIDs and SHA-256 (`test-utils/fakeCrypto.ts`), and `expo-haptics` for a recorder (`test-utils/fakeHaptics.ts`, reach it with `fakeHaptics()`). A test that needs fake timers on a screen uses `withFakeTimers` from `test-utils/fakeTimers.ts`, which unmounts before the real timers come back (expo-status-bar otherwise stalls the teardown).

## Settings

`src/settings/` stores the wearer's settings (K4): the module's `Settings` type, saved as JSON in `raveguard-settings.json` in the app's document directory (`expo-file-system`). PINs are not stored here (K6 keeps salted hashes in `expo-secure-store`).

| File | What it does |
| --- | --- |
| `SettingsProvider.tsx` | Loads the file once at launch; `useSettings()` gives `settings`, `isLoaded`, `problem`, `save(next)` and `reset()` |
| `settingsStore.ts` | `loadSettings` (never throws: a missing or damaged file gives the defaults plus a `problem`), `saveSettings`, `applySettings` (validate, save, then `configure()`) |
| `validateSettings.ts` | The same rules Swift's `ModuleSettings` applies, plus length limits (the meeting spot is at most 120 characters) and recipients kept in texting order; returns every issue with its path |
| `recipients.ts` | Add, update, remove, move and set permissions, returning new settings with `order` renumbered; ids from `expo-crypto`'s `randomUUID()` |
| `settingsStorage.ts` | The file (written to a temp file, then moved into place) and an in-memory storage for tests |

Settings reach Swift through `configure()` when they are saved and right before Start session, never just because the app launched: `configure()` during a running session reschedules the next check-in.

## Setup and Home

Setup is four steps (K5): who gets the alert (your name and the recipients in texting order: contacts and venue staff, reordered by dragging the grip, VoiceOver's Move up / Move down actions or the buttons in an open row), what each person sees (the permissions grid, "Get alerts" always on, and a preview of what the least-trusted recipient would get), your night (30 or 60 min check-ins, Quieter / Balanced / Louder = 80 / 85 / 90 dB, what you're wearing and an optional meeting spot) and the two PINs. Each Next checks only its own step; Finish checks everything, saves through `useSettings().save` and `usePins().savePins`, and opens Home. Home shows "Tonight, <name>", the AirPods, check-in, alert chain and hearing protection, Start session, Settings and the Debug panel link.

| File | What it does |
| --- | --- |
| `src/setup/setupWizardStore.ts`, `useSetupStep.ts` | The draft the four steps share, made from the saved settings when setup opens and forgotten when it closes |
| `src/setup/setupDraft.ts`, `setupSteps.ts` | The draft's fields and `checkSetup`, which builds the settings and PINs or gives one message per field, and which step each field is on |
| `src/setup/setupRows.ts` | Recipient rows (add, move, remove, kind, permissions) and the starter permissions |
| `src/setup/RecipientList.tsx`, `RecipientListRow.tsx`, `RecipientEditor.tsx` | Step 1's list, its compact rows with drag, and the open row |
| `src/setup/PermissionGrid.tsx`, `permissionPreview.ts` | Step 2's grid and preview |
| `src/setup/PinCard.tsx`, `PinEntryPanel.tsx`, `pinStep.ts` | Step 4's PIN cards and the keypad "Change" opens on the same screen |
| `src/setup/homeStatus.ts` | Home's status rows |
| `src/pin/pinRules.ts` | 4 to 8 digits each, and the two PINs must differ |
| `src/pin/pinStore.ts` | The `PinStore` interface (`hasPins`, `setPins`, `verify`, `clearPins`) and an in-memory stand-in for tests |
| `src/pin/securePinStore.ts` | The app's store (K6): both PINs as salted SHA-256 hashes in one `expo-secure-store` Keychain item (`raveguard.pins`, this device only); `verify` returns `safe`, `duress` or `wrong` |
| `src/pin/pinHash.ts` | 16-byte random salts, SHA-256 of `salt:pin` with `expo-crypto`, and a constant-time compare |
| `src/pin/PinStoreProvider.tsx` | `usePins()`; `appPinStore()` is the store the app uses (the secure one) |

## PIN gate

The PIN gate (`src/screens/PinEntryScreen.tsx`, K6) checks the entry with `usePins().store.verify(entry)` and sends the result to Swift with `pinResult`. During a check-in it shows the coral PIN stage and "Your contacts get a text in m:ss"; opened from Alert or SOS it says the contacts have been texted and offers Back. The keypad is `ui/Keypad` with "Submit PIN" in the bottom-left slot, enabled from 4 digits (PINs are 4 to 8 digits and only hashes are stored, so there is no auto-submit). Every wrong entry is sent as `wrong`; Swift counts them and fires the escalation on the third. If the Keychain can't be read, the screen says "Couldn't check your PIN. Try again." and sends nothing, so it isn't a strike.

After a correct PIN the screen runs one code path for both PINs (`src/pin/useCancelSequence.ts`, K9): `pinResult` goes out without being awaited, one success haptic plays (`expo-haptics`), "Cancelling…" shows for a fixed 600 ms (a static ring, nothing animated), then "Cancelled. Stay safe.", "Checked in at HH:MM" and "Back to my session". The PIN kind is passed straight to Swift and never kept in state, so nothing on screen can differ; `__tests__/screens/DuressCancelFrames.test.tsx` records both PINs at 60 fps and compares every frame.

| File | What it does |
| --- | --- |
| `src/pin/cancelSequence.ts` | `CANCELLING_MS = 600`, `CANCEL_HAPTIC` (success) and the step type |
| `src/pin/useCancelSequence.ts` | `startCancel(kind)`: sends `pinResult`, plays the haptic, shows "Cancelling…", then "Cancelled" after 600 ms; only the first call counts; clears its timer on unmount |
| `src/pin/pinFeedback.ts` | Fire-and-forget `sendPinResult` and `playCancelHaptic`; failures are swallowed so they can't show |
| `src/pin/PinGateNotice.tsx` | The countdown or "already texted" line and its bar |
| `src/pin/CancelView.tsx` | Cancelling… and Cancelled; it is never told which PIN was entered |

iOS keeps Keychain items after the app is deleted, so a reinstall still has the old PINs. Debug → Reset settings clears them.

## Check-in

The Check-in screen (`src/screens/CheckInScreen.tsx`, K7) is one component for both stages: the StageBar, what started the check-in (`phase.trigger`, a label on whisper and an amber card on loud), the 240 pt `ui/CountdownRing` (lavender on whisper, amber on loud; 196 pt on screens under 720 pt tall), "Are you okay?", the stage line, "Nod twice, or tap below." and a 96 pt "I'm okay" that calls `tapCancel()`. At the PIN gate the button becomes "Enter PIN", since Swift ignores `tapCancel` there (PhaseNavigator normally opens the PIN gate first).

| File | What it does |
| --- | --- |
| `src/checkIn/countdown.ts` | `stageCountdown(endsAt, startedAt, now)` gives seconds left and the share of the stage left |
| `src/checkIn/stages.ts`, `triggerCopy.ts`, `ringSize.ts` | Copy, colour and icon per stage; the trigger's words (from `describeTrigger`); the ring size |
| `src/checkIn/CheckInView.tsx` | The layout, presentational |
| `src/session/phaseState.ts` | `seePhase`: SessionStateProvider stamps when each phase step was first seen (`phaseSeenAt`), which is where the ring starts, since `onPhase` only carries the stage's end |

## Active session

The Active session screen (`src/screens/SessionScreen.tsx`, K8): the "Session live" pill with the elapsed time, the motion state and the next check-in (mm:ss), the Hearing card (room and in-ear dB, tonight's dose and the protection floor from `onHearing`, "—" while null; Automatic / Manual; the manual slider), the AirPods and noise-control cards, and a press-and-hold (1 s) Stop. Stop that Swift refuses (a check-in or alert is open) says so and stays put.

| File | What it does |
| --- | --- |
| `src/activeSession/HearingCard.tsx`, `AutoProtectionRow.tsx`, `ProtectionControl.tsx` | The Hearing card, its Automatic / Manual choice (`useAutoProtection`) and the 0–100 slider (`@react-native-community/slider`); VoiceOver reads "55 points" |
| `src/activeSession/MotionNow.tsx`, `SessionLivePill.tsx`, `StatusTile.tsx` | Right now and the next check-in, the pill, the two status cards |
| `src/activeSession/useSessionStartedAt.ts`, `sessionClock.ts` | The elapsed time, counted from when the app first sees the session |
| `src/activeSession/useProtectionLevel.ts` | Follows `onNoise` and the snapshot, and sends the wearer's level to `setProtectionLevel()` |
| `src/activeSession/levelSender.ts` | One `setProtectionLevel` call in flight at a time; levels pushed meanwhile collapse into the newest, so a drag always ends on its last level |
| `src/activeSession/protectionState.ts` | The confirmed level versus the one the wearer just chose, so the thumb doesn't jump back mid-drag |
| `src/activeSession/readings.ts` | Every reading as text and as VoiceOver words |
| `src/session/useSessionReadings.ts` | `onHearing`, `onMotion` (re-renders only when the state changes) and the snapshot's `nextCheckInAt`, re-read on every phase change |

## Alert and SOS

The Alert screen (`src/screens/AlertScreen.tsx`, K10) opens on `escalated`: a pill with when the first text went, a heading and status line for each state, one row per recipient (On it, No reply, Not texted), the phone-side "Summary" card (`src/alert/phoneSummary.ts`: "may need help" wording, no sensor numbers), "Call for help" and "I'm okay now" (the PIN gate), or "Back to session" once it closes. Acks arrive through `onEscalation`, which Swift sends after each 3 s status poll, so an ack on a contact's page shows here within 5 s. The SOS screen (`src/screens/SosScreen.tsx`) opens on `sos`: who was texted, the 232 pt round Call for help, "Read this out" with the meeting spot and what you're wearing, and "I'm okay now".

**Call never dials emergency services.** In demo mode it opens `tel:<teammatePhone>` (iOS asks before dialling); outside demo mode, or with no teammate number, it is off and says why. The teammate's number is set on the Debug screen (Save sample settings puts in a fictional one). `__tests__/alert/noEmergencyNumbers.test.ts` scans `src/`, the native module (JavaScript and Swift) and the app config for emergency numbers, and checks `src/alert/teammateCall.ts` is the only file with a `tel:` URL.

| File | What it does |
| --- | --- |
| `src/alert/alertModel.ts` | `summarizeAlert(phase, escalation)` (title, status line, tone, SOS, open), `recipientRows`, and the pill, heading and row words |
| `src/alert/teammateCall.ts`, `useTeammateCall.ts`, `callCopy.ts` | `callTarget(settings)`: the teammate in demo mode, nobody otherwise; `telUrl` only for a full E.164 number; the hook and words both screens share |
| `src/alert/AlertView.tsx`, `SosView.tsx`, `RecipientRow.tsx`, `CallPanel.tsx`, `SosCallButton.tsx` | The layouts, presentational |

## Debug panel

The Debug screen (`src/screens/DebugScreen.tsx`, K11) is where the demo is driven from: Back, live head motion (pitch, roll, |accel|, state), the Demo / Real timings, noise control (Shortcuts or Off; the Linux bridge is cut), Simulate offline and the seven scenarios (`debugFire(1–7)`); below them the raw phase, Start session / Tap Cancel / Stop session (one tap here, not the hold), the teammate number and Save sample settings / Reset settings. From idle a scenario first sends the saved settings through `configure()`; while a check-in or alert is open the rows are off, because Swift ignores a trigger then.

| File | What it does |
| --- | --- |
| `src/debug/scenarios.ts`, `ScenarioButtons.tsx`, `ScenarioRow.tsx` | The seven scenarios, their sublines (with the saved recipients' names) and rows |
| `src/debug/MotionReadout.tsx` | Subscribes to `onMotion` itself (10 Hz) so only it re-renders |
| `src/debug/TimingsControl.tsx`, `timings.ts` | Demo / Real, saved through `useSettings().save`; the seconds to SOS worked out from Swift's timings |
| `src/debug/NoiseBackendPicker.tsx`, `useNoiseState.ts` | `setNoiseBackend`, showing what `onNoise` reports |
| `src/debug/OfflineSwitch.tsx`, `useSimulatedOffline.ts` | `debugSetOffline`, showing the snapshot's `simulatedOffline` |
| `src/debug/DebugHeader.tsx`, `StatusLine.tsx`, `useDebugRunner.ts` | The header, the notice and error lines |
| `src/debug/TeammatePhoneField.tsx` | The teammate's number the demo call rings (K10) |

- `ios/` and `android/` are generated by `expo prebuild` and git-ignored. Never edit them. Native settings go in `app.json`, and our Swift goes in `modules/raveguard-native/ios/` (see WORK_ORDER.md for which folders are yours).
- Add packages with `npx expo install <pkg>`, not `npm install <pkg>`, so versions match SDK 57.
- Don't add `expo-av` or `expo-audio`. They configure the audio session themselves, which would undo Moses's audio setup (M5).

## Live AirPods motion

J12's motion half: during a session the app reads the AirPods' head motion for real (Justin's `HeadMotionStream`; see `modules/raveguard-native/README.md`). Server calls use `ServerClient` when `RG_SERVER_URL` is configured and otherwise use the fake; the session log remains in memory. The native [M6 voice prompter](modules/raveguard-native/ios/Voice/README.md) is wired in; it requires A2DP output and still needs physical AirPods validation.

1. Native code changed, so rebuild once: `npm run ios:device`.
2. Put both AirPods in (Pro, Max, or 3rd generation and later), open Debug and tap Start session. Allow Motion & Fitness when iOS asks.
3. Debug's motion readout shows live pitch, roll, g and a state (dancing, walking or still) that follows you; the Active session screen's motion tile shows the state. Motion runs only while a session does.

Three dialogs, from `src/airpods/` (mounted once in the root layout as `AirPodsConnectionAlerts`): **AirPods connected** when head motion starts arriving, **AirPods disconnected** when one comes out (and connected again when it goes back), and, once per session, **No AirPods motion yet** after 10 s of a session without them, pointing at Settings → Privacy & Security → Motion & Fitness → RaveGuard. A relaunch mid-session with the AirPods already in shows nothing.

Real triggers fire during sessions now: a fall, and stillness (sitting still for 30 s in demo mode, 2 min otherwise, opens a check-in), and a nod answers the whisper.

| File | What it does |
| --- | --- |
| `src/airpods/airPodsAlerts.ts` | Which dialog a connection change calls for (pure), the dialogs' text and the 10 s hint delay |
| `src/airpods/useAirPodsAlerts.ts` | Follows `onAirPods`, seeded silently from the snapshot's `airPodsConnected`; runs the no-motion hint timer while a session runs |
| `src/airpods/AirPodsConnectionAlerts.tsx` | Renders nothing; calls the hook from the root layout |

## Automatic protection

Backlog BL1. Swift sets the protection level from the room's loudness and tracks the sound dose, because it has to keep going with the phone locked (the loop itself is described in `modules/raveguard-native/README.md`). Every session starts automatic. The Hearing card on Active session offers Automatic and Manual; moving the slider also switches to manual, and Automatic hands protection back to Swift's loop. Demo mode reads a canned bar-to-club loudness trace; real sessions activate Moses's M5 audio session and meter the built-in mic, showing "—" until permission and a valid input route are available. The Shortcuts backend routes the level policy to user-created Adaptive/Noise Cancellation shortcuts and accepts their `raveguard://` callbacks (`src/app/+native-intent.tsx` keeps the current screen when one returns). Mic calibration remains a device task.

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
