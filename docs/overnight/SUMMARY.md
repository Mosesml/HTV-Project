# Overnight summary: K3 to K11

All nine tasks are done and pushed. Each branch is stacked on the one before it, so `kean/k11-debug-panel` contains everything from K3 to K11. **Nothing has been merged to `main`.**

Every branch passed Jest, `tsc --noEmit`, `expo lint`, the Swift tests and an iPhone 18 Pro Simulator build. What is left is the testing that needs a person, a real phone or the real server (see below).

## Status

| Task | Branch | Head | Status | Checks | Notes |
| --- | --- | --- | --- | --- | --- |
| K3: Navigation shell, six skeletal screens (D3) | `kean/k3-nav-shell` | `097a317` | Done, pushed | Jest 87 tests / 9 suites; typecheck, lint pass; Swift 113; sim build pass | [K3.md](K3.md) |
| K4: Settings storage sent through `configure()` (D4) | `kean/k4-settings` | `0c823a2` | Done, pushed | Jest 164 / 13 (settings coverage 98.8%); typecheck, lint pass; Swift 113; sim build pass | [K4.md](K4.md) |
| K5: Setup flow with both PINs (D5, UI-1) | `kean/k5-setup` | `a1c1819` | Done, pushed | Jest 236 / 19; typecheck, lint pass; Swift 113; sim build pass | [K5.md](K5.md) |
| K6: PIN gate, salted hashes in expo-secure-store (D6, PRV-4, ESC-7) | `kean/k6-pin-gate` | `7714610` | Done, pushed | Jest 280 / 22; typecheck, lint pass; Swift 113; sim build pass | [K6.md](K6.md) |
| K7: Check-in screen with countdown ring (D8, UI-3) | `kean/k7-check-in` | `a1f52b0` | Done, pushed | Jest 326 / 27; typecheck, lint pass; Swift 113; sim build pass | [K7.md](K7.md) |
| K8: Active session screen and protection slider (D9, HRG-5, UI-2) | `kean/k8-active-session` | `06c266f` | Done, pushed | Jest 386 / 31; typecheck, lint pass; Swift 117; sim build pass | [K8.md](K8.md) |
| K9: Duress-identical cancel (D7, UI-4) | `kean/k9-duress-cancel` | `127d764` | Done, pushed | Jest 406 / 34; typecheck, lint pass; Swift 117; sim build pass | [K9.md](K9.md) |
| K10: Alert screen (D10, UI-5) | `kean/k10-alert` | `a02d7bd` | Done, pushed | Jest 451 / 38; typecheck, lint pass; Swift 118; sim build pass | [K10.md](K10.md) |
| K11: Debug panel (D11, UI-6, DEM-2) | `kean/k11-debug-panel` | `bb3f92c` | Done, pushed | Jest 508 / 42; typecheck, lint pass; Swift 121; sim build pass | [K11.md](K11.md) |

Note for K3: typecheck needed the git-ignored `.expo/types/router.d.ts` regenerated locally. `npm start` regenerates it for anyone else.

## Contract changes to tell the team about

### Native module API (Justin, Moses, anyone using the seam)

No method or event was added, removed or renamed. `index.ts`, `RaveGuardModule.swift` and `onPhase` are unchanged. Two **additive fields on `Snapshot`**:

1. **`Snapshot.nextCheckInAt: number | null`** (K8). This is the next scheduled check-in as epoch ms while monitoring, and `null` otherwise (always `null` in demo mode).
   - `RaveGuardNative.types.ts` gains the field.
   - `RaveGuardRuntime.swift` `snapshot()` reads it from `SessionManager.nextCheckIn`. `SessionManager` itself is untouched.
   - `mock.ts`: the idle snapshot has `nextCheckInAt: null`.
2. **`Snapshot.simulatedOffline: boolean`** (K11). It turns true after `debugSetOffline(true)` or once scenario 4 registers its escalation, and `stopSession()` turns it off. It is not sent as an event.
   - `RaveGuardNative.types.ts` gains the field.
   - `RaveGuardRuntime.swift` `snapshot()` adds `"simulatedOffline": session.simulatedOffline`. This reads the existing `private(set)` property, and `SessionManager.swift` is unchanged.
   - `mock.ts`: `IDLE_SNAPSHOT.simulatedOffline = false`, and `debugSetOffline(on)` updates the snapshot the way Swift does.
   - `app/modules/raveguard-native/README.md` documents the field and the mock behaviour.

### Mock behaviour changes (`app/modules/raveguard-native/src/mock.ts`)

- K3: the test-only `setSnapshot(snapshot)` controls `getSnapshot()`, and `reset()` restores the idle snapshot.
- K8: `setProtectionLevel` and `setNoiseBackend` now update the snapshot's noise and emit `onNoise`, as Swift already did.
- K11: `debugSetOffline` updates `simulatedOffline` (see above).

### New native packages: every teammate must rebuild their dev build

After pulling, run `cd app && npm run ios:device` (phone) or `npx expo run:ios` (Simulator).

| Task | Package | Notes |
| --- | --- | --- |
| K4 | `expo-crypto` (ExpoCrypto 57.0.4) | Recipient ids, and later the PIN salts and hashes |
| K6 | `expo-secure-store` ~57.0.4 | Config plugin in `app/app.json` with `faceIDPermission: false` |
| K8 | `@react-native-community/slider` 5.2.0 | Plus the Swift snapshot change |
| K9 | `expo-haptics` ~57.0.3 | No config plugin |

All of them stay on SDK 57.

### Test tooling and app-internal changes (no action needed, good to know)

- K3: dev dependencies `@testing-library/react-native` 13.3.3 and `react-test-renderer` 19.2.3. The Jest config gains `setupFiles: jest.setup.ts`, which mocks the native module globally.
- K6: `jest.setup.ts` mocks `expo-secure-store` and a fuller `expo-crypto` (random bytes, SHA-256).
- K9: `jest.setup.ts` mocks `expo-haptics` with the `test-utils/fakeHaptics.ts` recorder.
- K7: `useSessionState()` gains `phaseSeenAt: number | null`, and `ActionButton` gains optional `size` (`'regular' | 'large'`) and `accessibilityHint` props.
- Swift tests added: K8 `protectionLevelDrivesTheFakeNoiseController`; K10 `contactOneAckReachesOnEscalationWithinFiveSeconds`; K11 `snapshotCarriesSimulatedOffline`, `snapshotShowsScenario4GoingOfflineAndStopComingBack` and `everyScenarioFiredFromIdleReachesTheWhisperCheckIn` (×7).

K4, K5 and K10 made no contract changes.

## Needs Kean's manual testing

The step numbers refer to the test guide in each K file.

### K3: navigation shell ([K3.md](K3.md))
- [ ] Walk the 13-step guide on the phone (`npm run ios:device`) or Simulator (`npx expo run:ios`) to confirm every screen is reachable (the done-when).
- [ ] A check-in auto-opens Check-in, the PIN gate auto-opens PIN entry, and 3 wrong PINs or the PIN gate timeout auto-open Alert, later showing SOS.
- [ ] The safe and duress PINs show the same "Cancelled. Stay safe." screen. Since K6 these are the PINs set in Setup, not 1111/9999.

### K4: settings storage ([K4.md](K4.md))
- [ ] Rebuild the dev build once (new `expo-crypto`).
- [ ] Debug > Save sample settings, then kill and reopen. Setup still shows "Wearer: Sample wearer", "60 min · 90 dB", and Contact 1, Contact 2 and Venue staff (steps 1–7, the done-when).
- [ ] Debug > Reset settings, then relaunch. Setup shows "Not set up yet: using the defaults."

### K5: setup flow ([K5.md](K5.md))
- [ ] Time scenario 7's setup from scratch (name, 3 names and phones, both PINs, Save setup) and check it takes **under 60 s** (steps 4–5, the done-when).
- [ ] The form scrolls with the keyboard up (number pad for phones and PINs), and Show PINs reveals both.

### K6: PIN gate ([K6.md](K6.md))
- [ ] PINs set in Setup survive killing and reopening the app (Keychain).
- [ ] The safe PIN at the PIN gate shows "Cancelled. Stay safe." and the session returns to monitoring.
- [ ] The duress PIN shows the identical screen, and no Alert screen opens.
- [ ] Three wrong PINs make Swift escalate, and the Alert screen opens (ESC-7).
- [ ] After a reinstall the old PINs are still in the Keychain (decision 10). Debug > Reset settings clears them.

### K7: Check-in ([K7.md](K7.md))
- [ ] One-handed in the dark: your thumb reaches Cancel without changing grip, and the screen is readable at low brightness without glare (steps 4 and 6, the done-when).
- [ ] VoiceOver order: question, stage, hint, "Time left to answer, N seconds left" as one element, then Cancel with its hint (step 7).
- [ ] At the largest Dynamic Type size, the heading, ring number and button label still fit (step 8).
- [ ] The ring drains smoothly through Debug scenario 2's demo ladder and refills on the Loud stage (steps 1–3 and 5).

### K8: Active session ([K8.md](K8.md))
- [ ] Rebuild (new native slider and the Swift snapshot change).
- [ ] When you drag the slider, the number follows the drag and lands on the release value, and the mode line flips to Noise Cancellation at 70.
- [ ] VoiceOver reads "Protection level, N points, adjustable", and each swipe moves the level by 1.
- [ ] Next check-in shows "In 30 min" or "In 60 min" with demo off, and refreshes after cancelling a check-in.
- [ ] Real AirPods switch through Shortcuts when the slider crosses 70. This needs the demo phone with the RG shortcuts installed, plus the K11 backend picker (now built) or J12's wiring.

### K9: duress-identical cancel ([K9.md](K9.md))
- [ ] Screen-record a safe PIN (2468) and a duress PIN (1357) at the PIN gate and compare them frame by frame (steps 2–5, the done-when).
- [ ] On a physical iPhone, the success haptic is felt once for both PINs and not on a wrong PIN. The Simulator has no haptics.
- [ ] After a duress PIN, Debug shows monitoring and no Alert screen opens.

### K10: Alert ([K10.md](K10.md))
- [ ] On a real phone, Call teammate brings up iOS's "Call +1…?" prompt for the number entered on Debug. The Simulator shows "Couldn't start the call. Dial … yourself."
- [ ] **Before the demo:** replace the made-up sample teammate number `+14165550199` on the Debug screen with a real teammate's number.
- [ ] VoiceOver reading of the Alert banner and the recipient rows.
- [ ] The ack within 5 s on the real server (blocked, see below).

### K11: Debug panel ([K11.md](K11.md))
- [ ] Fire each of the 7 scenarios from Debug and watch each one run end to end (step 4). Check in particular that scenario 3's duress PIN looks like a safe cancel.
- [ ] Scenario 4 turns Simulate offline on by itself, and Stop session turns it off.
- [ ] The demo timings toggle survives a relaunch, and the Start label changes between demo and real timings.
- [ ] The live motion readout updates about 10 times a second during a session.
- [ ] The scenario buttons are greyed out while a check-in is open. This only applies if the Check-in screen lets you swipe back to Debug.

## Blocked items

No task is blocked: all nine reached "done". A few checks can't be run until other people's work lands:

| Item | Blocked on | Why |
| --- | --- | --- |
| K10 done-when: tap Acknowledge on Contact 1's page and see "Contact 1 acknowledged at HH:MM" on the Alert screen within 5 s | Andy's server (AN5, AN11) and Justin's real-service wiring (J12) | So far this is only verified against the mock and the scripted Swift server (Jest, plus the Swift test `contactOneAckReachesOnEscalationWithinFiveSeconds`). |
| K8: real AirPods switching through Shortcuts at level 70 | J12 wiring (or the K11 backend picker) and the demo phone with the RG shortcuts installed | The fake noise controller path is verified in Swift and Jest. The real device path needs the phone and the shortcuts. |
| K11: real-stack pass/fail of each of the 7 scenarios (server, SMS) | Integration (J12, C11) | The app side is verified, and each scenario reaches the whisper check-in in Swift. SMS and server delivery are integration work. |

## Order to test and merge

The branches are stacked: each one contains all the ones before it. Test them in this order, and merge them into `main` in the same order (or merge K11 alone once all are signed off, since it contains everything). **Nothing has been merged to `main` yet.**

1. `kean/k3-nav-shell`: routing and the six screens
2. `kean/k4-settings`: **rebuild** (expo-crypto)
3. `kean/k5-setup`
4. `kean/k6-pin-gate`: **rebuild** (expo-secure-store)
5. `kean/k7-check-in`
6. `kean/k8-active-session`: **rebuild** (slider and the Swift snapshot change)
7. `kean/k9-duress-cancel`: **rebuild** (expo-haptics)
8. `kean/k10-alert`
9. `kean/k11-debug-panel`: contains everything above

To save rebuilds, you can do one build on `kean/k11-debug-panel` and work down the checklist above from K3 to K11. Several earlier checks (the PIN screens, the scenarios) are easiest to drive from the K11 Debug panel anyway. If something fails, fix it on the earliest branch where it appears and restack the later branches on top.

Before merging, tell the team about the two new `Snapshot` fields and the four new native packages (everyone needs a rebuild after pulling).
