# UI redesign: Active session (group `active`)

Branch `kean/ui-active`, from `kean/ui-foundation` (ae17118). Run unattended; every open choice took the recommended option and is recorded under Decisions.

## Plan

### Restated

Rebuild the Active session screen (`/session`, `app/src/screens/SessionScreen.tsx`) to match `docs/design/screens/Active.html`, from the shared `src/ui` components and tokens, without touching any shared file. The screen keeps every behaviour it has (readings from `onHearing` / `onMotion` / the snapshot, the latest-wins protection slider through `useProtectionLevel`, Stop with its refused and failed messages, a check-in opening Check-in, a way to Debug) and gains: the "Session live" pill with elapsed time, the big motion state, a `mm:ss` next check-in countdown, the Hearing card, the AirPods and Bridge mini cards, and a 1 s press-and-hold Stop with a VoiceOver fallback.

### Mockup elements and how each is built

| Mockup element | Built with | Data |
| --- | --- | --- |
| "Session live · 1h 42m" pill | `StatusPill tone="live"` in `activeSession/SessionLivePill.tsx` | Elapsed since the screen first saw the session running (`activeSession/useSessionStartedAt.ts`, pure rule `nextSessionStart` in `sessionClock.ts`), formatted by `formatElapsed` |
| Debug button (terminal icon, 44 pt) | `IconButton icon="terminal"`, label "Debug panel" | `router.push(ROUTES.debug)` |
| "RIGHT NOW" / "Dancing" / "Next check-in in 12:40" | `activeSession/MotionNow.tsx`: `TEXT.overline`, `TEXT.display`, `TEXT.body` + tabular `TEXT.labelNumeric` | `useSessionReadings().motionState` (`onMotion`), `.nextCheckInAt` (snapshot, re-read on every phase change), 1 s `useNow` |
| Hearing card: title + "Estimates, not a medical reading" | `Card` in `activeSession/HearingCard.tsx` | |
| Room / In your ears tiles | `MetricTile` (unit "dB", in-ear in `PALETTE.blue`) | `hearing.roomDb`; in-ear has no source in the contract yet, so it is "—" |
| Tonight's dose row + bar + floor text | `ProgressBar` (lavender) | `hearing.dosePercent`; floor has no source yet, so "—" |
| Protection label + level + slider + Hear more / Filter more | `activeSession/ProtectionControl.tsx` (restyled `@react-native-community/slider`) | `useProtectionLevel()` (unchanged), which calls `setProtectionLevel` |
| AirPods / Bridge mini cards | `activeSession/StatusTile.tsx` with `StatusDot` | `useSessionState().airPodsConnected`; `useProtectionLevel().noise` (backend, connected, level) |
| Stop session (coral square, 1.5 pt emphasis border) | `HoldToConfirmButton` in the `Screen` footer | `RaveGuard.stopSession()`; false keeps the friendly message |

### Data sources (file refs)

- `app/src/session/useSessionReadings.ts`: hearing, motion state, next check-in, read error.
- `app/src/session/SessionStateProvider.tsx`: `phase`, `airPodsConnected`.
- `app/src/activeSession/useProtectionLevel.ts`: `noise`, `sliderLevel`, `choose`, `error` (API kept).
- `app/src/session/useNow.ts`: ticking clock for the countdown and the elapsed time.
- `app/modules/raveguard-native/src/RaveGuardNative.types.ts`: `HearingEvent` has only `roomDb` and `dosePercent`; there is no session start time, in-ear level or protection floor.

### Risks

| Risk | Mitigation |
| --- | --- |
| The snapshot has no session start time | Count from when the screen first sees the session running (it opens on `monitoring` and stays mounted under Check-in, PIN, Alert, SOS and Debug); reset on `idle`. After an app relaunch mid-session it counts from the relaunch (documented) |
| setup-home's tests (`SetupFlow.test.tsx:95`, `SetupScreen.test.tsx:44,53`) still look for the text "Session running", which the mockup drops | Keep "Session running" as the screen's VoiceOver heading (visually hidden), so their tests pass on both branches; listed under shared changes to move them to route checks |
| No in-ear dB or protection floor in the contract | Show "—" (README rule 3) and list the contract change needed |
| Hold-to-stop is harder to test than a tap | Tests use VoiceOver's `activate` for the Stop outcomes, plus fake timers for the 1 s hold and a short press that must not stop |
| A 1 s clock re-rendering the whole screen | The clocks live in the small `MotionNow` and `SessionLivePill` components |

## What was built

| File | What |
| --- | --- |
| `app/src/screens/SessionScreen.tsx` | The redesigned screen: `Screen` with the hold-to-stop footer, a VoiceOver-only "Session running" heading, the pill + Debug `IconButton` header, `MotionNow`, `HearingCard`, the two `StatusTile`s, and the error lines (`role="alert"`). Stop keeps its two messages (refused: "The session is still running: answer the check-in or alert first, then stop."; failed: "Couldn't stop the session (…). Try again.") |
| `app/src/activeSession/SessionLivePill.tsx` (new) | `StatusPill tone="live"` "Session live" + elapsed ("12m", "1h 42m"); VoiceOver "Session live, 1 hour 42 minutes". Own 1 s clock |
| `app/src/activeSession/useSessionStartedAt.ts`, `sessionClock.ts` (new) | Start time: the screen's mount, kept through check-ins, cleared on `idle` (pure rule `nextSessionStart`) |
| `app/src/activeSession/MotionNow.tsx` (new) | "RIGHT NOW" / motion state in `TEXT.display` / "Next check-in in mm:ss" (or "—"). Own 1 s clock. VoiceOver: "Right now: Dancing", "Next check-in in 12 minutes 40 seconds" / "Next check-in: not scheduled" |
| `app/src/activeSession/HearingCard.tsx` (new) | Title + "Estimates, not a medical reading", Room and In your ears `MetricTile`s, dose row + `ProgressBar` ("Tonight's dose (estimate)", value "46 percent of a safe daily amount" or "no reading yet") + floor line, then the slider |
| `app/src/activeSession/ProtectionControl.tsx` | Restyled: "Protection" + level, lavender slider on `surface2`, 44 pt tall, "Hear more" / "Filter more" (hidden from VoiceOver; the hint says it). Same slider props and accessibility (points, 0–100 in whole steps, tap to seek, sends on change and on release) |
| `app/src/activeSession/StatusTile.tsx` (new) | The AirPods / Bridge mini card: dot + title + status, one VoiceOver element ("AirPods: Connected"), at least 44 pt |
| `app/src/activeSession/readings.ts` | Added `formatElapsed`, `spokenElapsed`, `formatCountdown`, `spokenCountdown`, `roomDbValue`, `inEarDbValue`, `doseFraction`, `doseSpoken`, `floorLine`, `airPodsStatus`, `noiseStatus`. Existing exports unchanged (`NO_VALUE` is now re-exported from `ui/text`, same "—") |
| `app/src/activeSession/ReadingTile.tsx` | Deleted (replaced by `ui/MetricTile`; nothing else used it) |
| Tests | `__tests__/screens/SessionScreen.test.tsx` (35 tests), `__tests__/activeSession/readings.test.ts` (new formatters), `ProtectionControl.test.tsx`, `sessionClock.test.ts` (new) |

`useProtectionLevel.ts`, `levelSender.ts` and `protectionState.ts` are untouched.

## Decisions (taken on Kean's behalf)

1. **Elapsed time counts from when the screen first sees the session** (its mount, which is when `monitoring` opens it), keeps counting under Check-in / PIN / Alert / SOS / Debug (the screen stays mounted below them), and resets on `idle`. Swift sends no start time; after a relaunch mid-session it counts from the relaunch. Format "12m" / "1h 42m", updated every second.
2. **Next check-in is `mm:ss`**, seconds rounded up, "00:00" once due, "—" when `nextCheckInAt` is null (demo mode). Minutes can read 60 for a 60-minute interval ("60:00").
3. **In-ear dB and the protection floor are always "—"** for now: `HearingEvent` has only `roomDb` and `dosePercent`. The floor line reads "100% is a full day's safe exposure. Protection floor: —." and becomes "… Protection floor has risen to 45." once a value exists (`floorLine`).
4. **The Bridge card is named after the backend in use**: "Bridge", "Shortcuts", or "Noise control" (when off), with "Adaptive · 62" / "Noise Cancellation · 85" when connected, "Not connected" (amber dot), "Off", or "—" before the module reports. The mockup's "Adaptive · 72" contradicts Moses's threshold (Noise Cancellation from 70), so the screen follows the logic, not the sample copy. This card replaces the old mode line under the slider (the same information).
5. **AirPods card**: "Connected" (mint), "Not connected" (amber: no head motion means no nods), "—" until Swift reports.
6. **A "Session running" heading only VoiceOver reads** (1 pt, background-coloured, no opacity 0 so VoiceOver keeps it). It gives the screen a rotor heading, and setup-home's tests still look for that text (see shared changes).
7. **Stop session** uses the shared `HoldToConfirmButton` (1 s, the mockup's 64 pt, coral square, emphasis border, "Press and hold" caption); VoiceOver's double-tap stops at once. A tap or a short press does nothing.
8. **Debug** is the 44 pt terminal `IconButton`, labelled "Debug panel" (the mockup's aria-label).
9. **Slider track is 44 pt tall** (mockup 28) to meet the touch-target rule.
10. **Motion labels unchanged** (`motionLabel`: Dancing, Walking, Still, Fallen, Unknown).

## Shared or contract changes needed (not made)

1. **Contract (HearingEvent)**: append `inEarDb: number | null` (room dB minus attenuation, PRD HRG-2) and `floorLevel: number | null` (the protection floor that only rises, HRG-3) to `HearingEvent` in `RaveGuardNative.types.ts`, the mock's `IDLE_SNAPSHOT.hearing`, and the Swift payload. Then `HearingCard` passes `hearing.inEarDb` to `inEarDbValue` and `hearing.floorLevel` to `floorLine` (two one-line changes).
2. **Optional contract**: `Snapshot.sessionStartedAt: number | null` so the elapsed time survives an app relaunch.
3. **setup-home tests**: `__tests__/setup/SetupFlow.test.tsx:95` and `__tests__/screens/SetupScreen.test.tsx:44,53` assert `findByText('Session running')` on this screen; they should assert `app.getPathname()` is `/session` instead (the hidden heading keeps them passing meanwhile). Add "Session running" (the Active session's header role) to OWNERSHIP.md's cross-group anchors until then.
4. **Test tooling note for `src/ui` / `test-utils`**: a screen that renders `Screen` (it mounts `expo-status-bar`) under Jest fake timers and is cleaned up after `jest.useRealTimers()` never finishes unmounting, so the test file hangs. `SessionScreen.test.tsx` unmounts before restoring real timers; a shared `withFakeTimers` helper in `test-utils/` doing the same would save the other groups the hunt.

## How to test

### Automated

```bash
cd app
npx jest                 # 55 suites, 673 tests
npx tsc --noEmit
npx expo lint
```

### Phone or Simulator (compare with `docs/design/screens/Active.html`)

1. Open the app with settings saved, tap **Start session** on Home. Expected: Active session opens on the dark background; top left the pill "● Session live 0m" (mint dot), top right a 44 pt square terminal button.
2. Wait a minute or two. Expected: the pill reads "1m", "2m", …; after an hour "1h 0m".
3. Look under the pill. Expected: "RIGHT NOW" in muted caps, the motion state large in lavender ("Dancing", "Walking", "Still"; "—" before the first readout), then "Next check-in in 29:59" counting down every second (with demo mode on: "Next check-in in —").
4. Move your head / walk around with the AirPods in. Expected: the motion word changes within a second or so.
5. Look at the Hearing card. Expected: "Hearing" with "Estimates, not a medical reading"; Room and In your ears tiles show "—" (no hearing data until BL1; In your ears is blue once it has a value); "Tonight's dose" with "—" and an empty bar; "100% is a full day's safe exposure. Protection floor: —."
6. Drag the Protection slider. Expected: the number beside "Protection" follows; "Hear more" on the left, "Filter more" on the right; the Bridge card's line switches from "Adaptive · N" to "Noise Cancellation · N" at 70 when a backend is connected. A failed change shows a coral message and the thumb goes back.
7. Check the two mini cards. Expected: "AirPods / Connected" with a mint dot (amber "Not connected" if the AirPods drop out, "—" until the first report). The second card is "Bridge" / "Shortcuts" / "Noise control" by backend, with its mode and level, "Not connected" or "Off".
8. Tap **Stop session** quickly. Expected: nothing happens. Press and hold: a coral-soft fill grows across the button; let go before 1 s and it drains back.
9. Hold for a full second. Expected: the session stops and Home opens.
10. During a check-in (Debug → scenario 1), try Stop from the session screen when it's back: if Swift refuses, the coral line "The session is still running: answer the check-in or alert first, then stop." appears and the screen stays.
11. Start again, tap the terminal button. Expected: Debug opens; Back returns to Active session with the elapsed time still counting.
12. VoiceOver on: swipe through. Expected: "Session running, heading", "Session live, 2 minutes", "Debug panel, button", "Right now: Dancing", "Next check-in in 29 minutes 12 seconds", "Hearing, heading", "Room: no reading yet", "In your ears: no reading yet", "Tonight's dose (estimate), no reading yet", "Protection level: 40", the slider ("Protection level, 40 points, adjustable"; hint "Lower hears more, higher filters more…"), "AirPods: Connected", "Bridge: …", "Stop session, button, Press and hold for 1 second. With VoiceOver, double-tap." Double-tapping Stop stops the session.

## Verification

| Check | Result |
| --- | --- |
| `npx jest` | 55 suites, 673 tests, all pass (one run had a 5 s timeout in `navigation/HomeRoute.test.tsx` while five other agents were testing at once; it passes alone and on the rerun) |
| `npx tsc --noEmit` | exit 0 |
| `npx expo lint` | exit 0 |
