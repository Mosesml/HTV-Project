# UI redesign: overnight summary

The whole redesign is on **`kean/ui-redesign`**: the foundation, all six screen groups, the shared changes the groups asked for, and `origin/main` up to `32d4f33` (automatic protection, motion classifier and stillness trigger, Shortcuts routing, the M5 audio session, and Andy's server work). **Nothing is merged to main.** Kean tests on his phone, then merges `kean/ui-redesign` himself.

## Status

| Part | Branch | Status | Checks | Notes |
| --- | --- | --- | --- | --- |
| Foundation | `kean/ui-foundation` | Done, pushed | jest, tsc, lint, swift test, simulator build: pass | [UI-foundation.md](UI-foundation.md) |
| Setup + Home | `kean/ui-setup-home` | Done, pushed | jest, tsc, lint: pass | [UI-setup-home.md](UI-setup-home.md) |
| Active session | `kean/ui-active` | Done, pushed | jest, tsc, lint: pass | [UI-active.md](UI-active.md) |
| Check-in | `kean/ui-checkin` | Done, pushed | jest, tsc, lint: pass | [UI-checkin.md](UI-checkin.md) |
| PIN gate + Cancel | `kean/ui-pin-cancel` | Done, pushed | jest, tsc, lint: pass | [UI-pin-cancel.md](UI-pin-cancel.md) |
| Alert + SOS | `kean/ui-alert-sos` | Done, pushed | jest, tsc, lint: pass | [UI-alert-sos.md](UI-alert-sos.md) |
| Debug | `kean/ui-debug` | Done, pushed | jest, tsc, lint: pass | [UI-debug.md](UI-debug.md) |
| **Integration** | **`kean/ui-redesign`** | **Done, pushed** | **jest 63 suites / 844 tests (DuressCancelFrames and noEmergencyNumbers pass); tsc; expo lint; swift test 218 tests in 27 suites; simulator build (iPhone 18 Pro, Debug) exit 0** | This file |

Every group pushed; there were no local-only branches to merge. The groups' screen work is described in their own notes; this file covers what integration changed.

## What integration did

1. **Merged the six groups** one at a time with `--no-ff`. They touched separate files, so there were no conflicts.
2. **Applied the shared changes the groups asked for:**
   - `ui/Keypad` has an optional `leftKey` for the empty bottom-left slot. The PIN gate puts "Submit PIN" there, and its own `PinKeypad` is gone. Its tests moved to `__tests__/ui/KeypadLeftKey.test.tsx` with every assertion kept. The keys look the same as before.
   - `ui/TextButton` accepts `accessibilityLabel`. Setup keeps its filled `SmallButton`, because that chip looks different from a text link.
   - A `SOS_CALL` theme token (232 / 10 / 44) replaces the SOS button's local constant.
   - `test-utils/fakeTimers.ts` provides `withFakeTimers`, which unmounts before the real timers come back. The Session and Alert tests use it.
   - The PIN route can no longer be swiped away. This is a fixed screen option, so it is the same for both PINs. Back from Alert or SOS and "Back to my session" still work.
   - The Debug scenario 1 hint now reads "Nod twice, or tap I'm okay, while the check-in asks."
   - OWNERSHIP.md lists "Session running" (the heading on Active session that only VoiceOver reads) as a cross-group anchor.
   - Jest `testTimeout` is now 15 s. The long setup flow took more than 5 s once under a full parallel run, and about 0.6 s on its own.
3. **Merged `origin/main` twice**, because main moved during the night. The conflicts were in the native types, the mock, the Swift runtime, `_layout.tsx` and Active session. Both sides were kept each time: the trigger tracking and AirPods stream next to the level sources, Shortcuts and the audio session; the font gate next to the `raveguard://` callback forwarding; and the redesigned Active session screen with main's Automatic / Manual control rebuilt in redesign style.
4. **Made the app coherent:**
   - Deleted the legacy light components (`ActionButton`, `ChipButton`, `ChoiceChips`, `FormField`, `ToggleRow`) and the `LEGACY` theme block. Nothing used them any more.
   - Deleted the pre-redesign `describeNextCheckIn` and `describeNoiseBackend` helpers, with their tests.
   - Updated the stale comments on `/setup`.
   - Rewrote the app README's screen sections.
   - Marked OWNERSHIP.md as historical.
   - No screen contains a hex colour, a raw font name or a raw icon stroke.
5. **Hearing data on Active session:** a contract change (below) means the Hearing card now shows the in-ear estimate and the protection floor instead of a permanent "—". Automatic / Manual sits above the slider.

## Screens and how to reach them

There are 14 screens, and every one is reachable:

- Setup 1–4: first launch, or Settings on Home.
- Home.
- Active session: Start session.
- Check-in, whisper and loud: from the session phase.
- PIN gate: the `pinGate` stage, or "I'm okay now" on Alert or SOS.
- Cancelling and Cancelled: inside `/pin`.
- Alert: the `escalated` phase.
- SOS: the `sos` phase.
- Debug: from Home or Active session.

Back paths:

- Stop goes to Home.
- "I'm okay" goes to Active session.
- "Back to my session" goes to Active session.
- Debug's Back returns to where Debug was opened.
- The setup steps go back one step, and step 1 goes back to Home.

## Contract changes to tell the team

**Justin especially:** `SessionManager` is still untouched. Everything below is in the module layer (`RaveGuardRuntime`, `Module/`), and every new field is added at the end of its payload.

| Change | Where | Since |
| --- | --- | --- |
| `onPhase` / `PhaseEvent.trigger: CheckInTrigger \| null` (`kind` scheduled / fall / stillness / manual, `reason`, `at`). It is set during checkIn, escalated and sos, and null during idle and monitoring, so a duress PIN looks like a safe one. Swift learns it from the session log through `TriggerTrackingLog`. | Runtime, types, mock | Foundation |
| New event `onAirPods {connected}` and `Snapshot.airPodsConnected: boolean \| null`. | Runtime `Event`, types, mock | Foundation |
| `Settings.meetingSpot: string` (default `''`, at most 120 characters; missing or null reads as `''`). Swift `ModuleSettings.meetingSpot`. | Settings, validation, Swift | Foundation |
| **`onHearing` / `HearingEvent` gains `inEarDb: number \| null`** (room dB minus the AirPods mode's estimated attenuation, the value the dose already counts) **and `floorLevel: number \| null`** (the level loop's dose-driven floor; null in manual). Both are null with no reading. | Swift `HearingState`, `AutoProtection`, types, mock, module README, WORK_ORDER contract row | Integration |

Main's own contract changes merged in unchanged: `setProtectionMode` and `HearingEvent.mode` (BL1), and `handleNoiseCallbackURL`.

## New packages (everyone must rebuild after pulling)

Compared with main, the redesign adds `react-native-svg` (native code), `@expo-google-fonts/sora`, `@expo-google-fonts/manrope` and `@expo-google-fonts/jetbrains-mono`. All were added by the foundation, and the groups added none. After pulling, run `npm install`, then rebuild the dev client with `npm run ios:device`. A JavaScript reload is not enough.

## QA checklist for Kean's phone test

Build from `/Users/keanyeung/Documents/GitHub/HTV-ui/redesign`. Compare each screen with its mockup in `docs/design/screens/`.

**Must-pass**

- [ ] **Duress cancel looks the same as a safe cancel.** Screen-record a safe-PIN run and a duress-PIN run from Debug scenario 2 (and scenario 3), side by side. Every frame, the timing and the haptic should match through Cancelling…, Cancelled and "Checked in at". Back from Cancelled should behave the same for both.
- [ ] **Press-and-hold Stop.** The fill grows over 1 s, letting go early drains it, a quick tap does nothing, and a full hold stops the session and opens Home. With VoiceOver, a double-tap stops it straight away.
- [ ] **SOS Call goes only to the teammate.** On Alert and on SOS, "Call for help" opens the iOS confirm sheet with the teammate number only. With demo mode off it is greyed out with an explanation. The caption says "never emergency services", and no emergency number appears anywhere.
- [ ] **Hearing "—".** Before any reading (and in a real session until the mic can record), Room, In your ears, the dose, Right now and the next check-in all show "—", and VoiceOver says "no reading yet".

**Setup and Home** (Setup-Contacts, Setup-Permissions, Setup-Session, Setup-PINs, Home)

- [ ] Fresh install: steps 1–4, then Finish shows "Tonight, <name>" on Home, and Start session opens Active session.
- [ ] Step 1 drag: the row lifts, follows your finger and drops in place, and the list doesn't scroll. With VoiceOver, Move up / Move down work, and the visible Move and Remove buttons work.
- [ ] The keyboard never hides the text fields on steps 1 and 3.
- [ ] Step 2: "Get alerts" stays locked on, and the "What <name> would get" preview is right.
- [ ] Step 3: Quieter / Balanced / Louder save as 80 / 85 / 90 dB, and the meeting spot saves.
- [ ] Step 4: "Change" opens the keypad on the same screen. It refuses a PIN equal to the other one, and the keys look like the PIN gate's.
- [ ] Settings, then Back to Home, saves nothing.

**Active session** (Active)

- [ ] The elapsed time keeps counting through Check-in, PIN, Alert and Debug.
- [ ] The next check-in counts down every second with demo mode off, and shows "—" with it on.
- [ ] Automatic / Manual: dragging the slider switches to Manual, and Automatic hands control back. The hint under it changes, and the floor line reads "—" in Manual.
- [ ] The demo trace fills Room, In your ears (~), the dose and "Protection floor has risen to N".
- [ ] The 44 pt slider can be dragged and tapped to seek.
- [ ] The AirPods card turns amber "Not connected" when the AirPods are taken out.
- [ ] Small phone: Stop stays pinned and the content scrolls.

**Check-in** (CheckIn-Whisper, CheckIn-Loud)

- [ ] Whisper: a lavender 240 pt ring, the trigger label, the speaker line and a 96 pt "I'm okay".
- [ ] Loud: an amber ring, the trigger card, the vibrate line, and "After this you'll need your PIN."
- [ ] A nod twice or "I'm okay" returns to Active session. Letting both stages run out opens the PIN gate.
- [ ] iPhone SE: the 196 pt ring fits without scrolling.

**PIN gate, Cancelling, Cancelled** (PIN-Gate, Cancelling, Cancelled)

- [ ] The countdown "Your contacts get a text in 0:NN" and the coral bar drain in step with Swift.
- [ ] Submit stays off until 4 digits. A 6-digit PIN doesn't auto-submit, and a 9th digit is ignored.
- [ ] From Alert or SOS: the copy says your contacts have been texted, there is no countdown, and Back returns without sending anything.
- [ ] An edge swipe no longer leaves the PIN gate.

**Alert and SOS** (Alert, SOS)

- [ ] Alert: the pill time, the avatars, the On it / No reply / Not texted words, and "On hold while <name> responds" after a real acknowledgement (within 5 s).
- [ ] The Summary card never reads as a diagnosis.
- [ ] SOS: the 232 pt button is centred, and "Read this out" shows the meeting spot and what you're wearing.
- [ ] Alert and SOS can't be swiped away.

**Debug** (Debug)

- [ ] Live head motion updates about 10 times a second in JetBrains Mono, and "10 Hz" replaces "No feed".
- [ ] Timings, noise control and Simulate offline all work, and offline flips on during scenario 4.
- [ ] Back returns to Home or Active session, whichever Debug was opened from.

**Everywhere**

- [ ] Sora, Manrope and JetBrains Mono render, and the splash stays up until they load.
- [ ] SVG rings and icons draw correctly on the device.
- [ ] VoiceOver gives every control a label, a role and a value, and the hidden "Session running" heading is announced.
- [ ] At the largest Dynamic Type size, every primary button stays reachable.

## Known gaps

- **The elapsed time restarts on relaunch.** It counts from when the app first sees the session; a future `Snapshot.sessionStartedAt` would fix this (not done).
- **Real sessions show "—" for hearing** until the mic has permission and a valid input route. Mic calibration (C13) is still a device task. In-ear values and the floor are estimates from placeholder attenuation figures.
- **Automatic / Manual is not in the mockup.** BL1 asked for it on Active session, so it sits in the Hearing card above the slider. Kean should check that the placement works.
- **Debug offers Bridge** although WORK_ORDER says the bridge is cut. To hide it, remove one entry from `NOISE_BACKEND_CHOICES`.
- **The setup draft lives in a small module store** (`setupWizardStore.ts`), not a provider in a setup layout. It works, and is tested.
- **Some model exports are now unused** but were kept because the logic interfaces are frozen: `describeTimings` and `describeRecipientLine` (settings), `litTicks` and `RING_TICKS` (check-in countdown), `stageTitle`, `phaseLabel` and `isSetupRoute`. They can go in a follow-up.
- **Not yet tested on a device:** fonts, SVG, drag-to-reorder, keyboard avoidance and haptics have only run in Jest and the Simulator build.
- **The first `origin/main` merge commit also contains the `inEarDb` / `floorLevel` contract change** and the first version of the Automatic control, so `git log` shows them inside that merge.

## How to test

```bash
cd /Users/keanyeung/Documents/GitHub/HTV-ui/redesign
git pull            # on kean/ui-redesign
cd app
npm install
npm run ios:device  # new native packages: a full rebuild is needed
```

Use the Debug panel (from Home or Active session) with Demo timings to run the scenarios. When the phone test passes, Kean merges `kean/ui-redesign` into main himself.

## Worktrees

After the push, the six group worktrees (`HTV-ui/setup-home`, `active`, `checkin`, `pin-cancel`, `alert-sos`, `debug`) were removed. Their branches stay pushed to origin. `HTV-ui/redesign` stays.
