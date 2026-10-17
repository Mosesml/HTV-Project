# UI redesign: Debug panel (group `debug`)

Branch `kean/ui-debug`, from `kean/ui-foundation` (ae17118). Run unattended; every open choice took the recommended option and is recorded under Decisions.

## Plan

### Restated

Restyle `/debug` to `docs/design/screens/Debug.html` with the shared `src/ui` components and tokens, keeping every K11 behaviour and its tests: a header with Back (returns to wherever Debug was opened from) and an amber "Simulated" pill; "Live head motion" as four JetBrains Mono tiles fed by `onMotion` at 10 Hz; Timings as a two-way Segmented (demo / real) saved through `useSettings().save`; Noise control as a three-way Segmented (Bridge / Shortcuts / Off) calling `setNoiseBackend`; the "Simulate offline" toggle (`debugSetOffline`, state read back from the snapshot); the seven "Fire a scenario" rows with the mockup titles and sublines, each calling `debugFire(n)`; Start / Stop session. Below the designed controls: the phase readout, Tap Cancel, the teammate number field and the Save sample / Reset settings tools.

### Mockup elements to build

| Mockup | Built from |
| --- | --- |
| Back (44 pt, outlined, chevron) | `IconButton icon="chevronLeft"` |
| "Debug" heading | `TEXT.titleSmall`, role header |
| "Simulated" tag | `StatusPill tone="warning"` (amber on `amberSoft`) |
| Live head motion card, "10 Hz" with mint dot | `Card` + `StatusDot` + local `MotionReadout` |
| pitch / roll / \|accel\| / state tiles | `MetricTile variant="mono"` (state in lavender) |
| Timings: "Demo · 95 s to SOS" / "Real · 7 min" | `Segmented` (lavender) |
| Noise control: Bridge / Shortcuts / Off | `Segmented accent="blue"` |
| Simulate offline row + 52 x 32 switch | `Card` + `Toggle size="large"` |
| Seven scenario rows (number chip, title, subline, play icon) | local `ScenarioRow` (no shared row has a number chip) |
| (not drawn) Start / Tap Cancel / Stop, teammate number, sample / reset | `PrimaryButton`, `SecondaryButton`, `TextField` |

### Data sources

- Phase: `useSessionState().phase` (`src/session/SessionStateProvider.tsx`), rendered with `describePhase` (`src/session/describe.ts`).
- Motion: `RaveGuard.addListener('onMotion')` inside `src/debug/MotionReadout.tsx` (so only the card re-renders at 10 Hz); `formatDegrees`, `formatG`, `describeMotion` from `src/session/describe.ts`.
- Timings: `useSettings().settings.demo` and `save()` (`src/settings/SettingsProvider.tsx`); the seconds come from Swift's `SessionTimings` (`modules/raveguard-native/ios/Session/SessionManagerConfig.swift`): demo 10 + 10 + 15 + 3 x 20 = 95 s to SOS; real 20 + 20 + 30 + 3 x 120 = 430 s, about 7 min.
- Noise: `useNoiseState()` (`src/debug/useNoiseState.ts`), `RaveGuard.setNoiseBackend`.
- Offline: `useSimulatedOffline(phase)` (`src/debug/useSimulatedOffline.ts`), `RaveGuard.debugSetOffline` + `getSnapshot().simulatedOffline`.
- Scenarios: `SCENARIOS`, `canFireScenario`, `configuresBeforeFiring`, `firedNotice` (`src/debug/scenarios.ts`), `RaveGuard.debugFire`; subline names from `settings.recipients` (by `order`).
- Tools: `TeammatePhoneField` (`parseTeammatePhone`, `E164_PATTERN`), `buildSampleSettings`, `useSettings().reset`, `usePins().clearPins`.

### Risks

| Risk | Mitigation |
| --- | --- |
| Tests drive the old RN `Switch` (`props.value`, `valueChange`) | The new `Toggle` and `Segmented` are Pressables with `accessibilityState`; tests move to presses and `checked`, every assertion kept |
| The old picker deliberately hid Bridge (bridge cut) | The task and the mockup ask for Bridge / Shortcuts / Off and the module accepts `bridge`; the caption shows whether Swift reports it connected (decision 2) |
| Mockup sublines use sample names (Maya, Theo) | Built from the saved recipients by order, "Contact 1" / "Contact 2" when missing |
| Notices at the top scroll out of view when firing scenario 7 | The status line is also announced to VoiceOver; the phase readout sits by the session controls |
| 10 Hz re-renders of the whole panel | `MotionReadout` subscribes itself, as before |
| Back with no history (Debug opened at launch) | `router.canGoBack()` else replace with Home |
| Touching shared files | Only `src/screens/DebugScreen.tsx`, `src/debug/*`, the Debug tests and this file change |

## What was built

All inside the debug group's files (`docs/design/OWNERSHIP.md`); no shared file changed.

| File | What |
| --- | --- |
| `app/src/screens/DebugScreen.tsx` | The panel on `Screen`, in the mockup's order, then Session and Demo tools. Back: `router.back()` when there is history, else `router.replace(ROUTES.home)` |
| `app/src/debug/DebugHeader.tsx` (new) | `IconButton` Back, "Debug" heading (`TEXT.titleSmall`, header role), `StatusPill tone="warning"` "Simulated" |
| `app/src/debug/StatusLine.tsx` (new) | The one notice / error line as an `InfoCallout` under the header; every message is also sent to `AccessibilityInfo.announceForAccessibility` |
| `app/src/debug/MotionReadout.tsx` | "Live head motion" card: mint dot + "10 Hz" once readouts arrive ("No feed" before), four `MetricTile variant="mono"` tiles (pitch, roll, \|accel\|, state in lavender; "—" before the first reading), the readout count; still one VoiceOver element ("Motion: …") that subscribes itself |
| `app/src/debug/timings.ts` (new) | `DEMO_TIMINGS` / `REAL_TIMINGS` mirroring Swift `SessionTimings`, `secondsToSos`, `TIMING_OPTIONS` ("Demo · 95 s to SOS", "Real · 7 min", spoken in full), the two hints |
| `app/src/debug/TimingsControl.tsx` (new, replaces `DemoToggle.tsx`) | `Segmented` radio group "Timings" + hint |
| `app/src/debug/NoiseBackendPicker.tsx` | `Segmented accent="blue"` radio group "Noise control": Bridge / Shortcuts / Off, plus "Backend: … · connected" |
| `app/src/debug/OfflineSwitch.tsx` | Card row "Simulate offline" / "Backup if airplane mode fails on stage" with `Toggle size="large"`; the switch carries the words (label, and the subline + what it does as the hint) |
| `app/src/debug/ScenarioRow.tsx` (new) | One scenario row: 34 pt number chip, title, subline, play icon; 60 pt tall; one button |
| `app/src/debug/ScenarioButtons.tsx` | The seven rows, the blocked reason above them |
| `app/src/debug/scenarios.ts` | Additive: `scenarioHint`, `ScenarioNames`, `DEFAULT_SCENARIO_NAMES`, `scenarioNames(recipients)`, `scenarioSummary` (the mockup sublines). Existing exports unchanged |
| `app/src/debug/TeammatePhoneField.tsx` | Same logic on `TextField` + `SecondaryButton` |
| Tests | `__tests__/screens/DebugScreen.test.tsx`, `__tests__/debug/{DebugControls,MotionReadout,ScenarioButtons,scenarios}.test.*` |

### Tests changed (structure legitimately changed; no behavioural assertion dropped)

- Timings and Simulate offline were RN `Switch`es (`props.value`, `valueChange`); they are now `Segmented` radios and the shared `Toggle`, so the same assertions read `accessibilityState.checked` and press. Starts from the saved flag, saves and configures, failed save keeps the old flag, snapshot-driven offline state, re-read on phase change: all still asserted.
- `NoiseBackendPicker` "offers Shortcuts and Off (the Linux bridge is cut)" became "offers Bridge, Shortcuts and Off" (decision 2); a screen test checks Bridge reaches `setNoiseBackend('bridge')`.
- Scenario rows: the trigger line ("Fall. …") moved from visible text into the VoiceOver hint, so "says which trigger each scenario fires" now counts hints (3 falls, 4 manual). The hint still ends with `next`.
- The scenario `test.each` titles printed "scenario NaN" (a `%i` fed a string); retitled.
- New: header, Back from Home / Active session / launch, VoiceOver announcement, mockup sublines with saved names, blocked rows, the 44 pt rows, the timing arithmetic, mono font and lavender state.

## Decisions taken on Kean's behalf

1. **Back** goes back in the stack when there is one (Home's "Debug panel", Active session's Debug), otherwise replaces with Home (Debug opened at launch or by deep link). Home then applies its own gate.
2. **Bridge is offered** in Noise control, as the task and the mockup ask, though the Linux bridge is cut in `WORK_ORDER.md`: the module and Swift accept `bridge`, and the line under the segments shows what Swift reports. If Kean wants it hidden, drop the first entry of `NOISE_BACKEND_CHOICES` and restore the old test.
3. **Timings copy is computed** from the Swift ladder (demo 10 + 10 + 15 + 3 x 20 = 95 s; real 20 + 20 + 30 + 3 x 120 = 430 s, shown "7 min", spoken "about 7 minutes"), so it can't drift silently: a unit test pins both numbers.
4. **Sublines name the saved recipients** (first two by texting order) where the mockup had Maya and Theo; "Contact 1" / "Contact 2" when missing or blank.
5. **Stop session in Debug is a plain tap**, not the 1 s hold: the hold guards the wearer's Active session against pocket presses; Debug is the operator's tool and the demo needs quick stops. Stop uses the `emphasis` outline like the Active screen.
6. **Below the mockup**: a Session section (raw `onPhase` in mono, Start session with "Demo/Real timings" as its caption and accessibility label "Start session (demo timings)", Tap Cancel, Stop session) and a Demo tools section (teammate number, Save sample settings, Reset settings). Tap Cancel stays because the existing test and the demo use it.
7. **Notices sit under the header** and are announced to VoiceOver, since the panel scrolls.
8. **"Simulated" pill** is always shown (the panel only fires simulated events); spoken "Simulated: scenarios here are test events".
9. **10 Hz** is the nominal feed rate, shown live (mint) once readouts arrive and "No feed" (faint) before; the readout count shows a stall.
10. Raw sizes avoided: spacing from `SPACE`, radii from `RADII`, row height `TOUCH.button`; the only local constant is the mockup's 34 pt scenario number chip (`IconChip` only takes icons).

## Contract or shared changes needed

None. Nice-to-have only (not required, not made): `IconChip` could accept text so the scenario number chip needn't be local; `ListRow` could take a trailing node with an `onPress` row for scenario rows.

## How to test

```bash
cd app
npx jest            # 54 suites, 662 tests
npx tsc --noEmit
npx expo lint
```

### On the phone or Simulator (Debug.html is the reference)

| # | Do | Expect |
| --- | --- | --- |
| 1 | From Home (with saved settings) tap "Debug panel" | Dark Debug panel: Back (44 pt, outlined chevron), "Debug", amber "Simulated" pill on the right |
| 2 | Look at Live head motion before a session | Four tiles showing "—", "No feed" in faint text, "no readouts yet (start a session)" |
| 3 | Tap Start session (lavender, caption "Demo timings") | Phase card says `monitoring` and Debug stays up (only Home moves to Active session on Start); tiles update about ten times a second in JetBrains Mono, state in lavender, mint dot + "10 Hz", count climbing |
| 4 | Back; then open Debug from Active session and Back again | First Back returns to Home (where Debug was opened), which moves on to Active session if the session is running; from Active session, Back returns to Active session |
| 5 | Timings: tap "Real · 7 min" | Lavender fill moves, notice "Real timings saved", hint switches to the real-timings line, Start session caption says "Real timings". Tap "Demo · 95 s to SOS" to go back |
| 6 | Noise control: tap Shortcuts, then Off, then Bridge | Blue fill follows, line reads "Backend: shortcuts · connected", "Backend: off · not connected", "Backend: bridge · connected" (the fake connects every backend) |
| 7 | Toggle Simulate offline on, then off | Track turns lavender, knob slides; off again. VoiceOver: "Simulate offline, switch", hint explains it |
| 8 | Fire scenario 1 (Safe) | Notice "Scenario 1 (Safe) fired. …" under the header (announced by VoiceOver); Check-in opens. Nod or tap |
| 9 | While a check-in is open, open Debug | Rows dimmed and not tappable, coral line "A check-in or alert is open…" |
| 10 | With Save sample settings done, read rows 5 and 7 | "Contact 1 never answers, Contact 2 is texted", "Contact 2 gets no location, short brief" (your saved names) |
| 11 | Fire scenario 2 (No response) and ignore everything | Check-in → PIN gate → Alert → SOS, as before |
| 12 | Fire scenario 4 | Once the alert is registered, Simulate offline flips on by itself; Stop session turns it off |
| 13 | Stop session during monitoring | Session stops (one tap); during a check-in: coral "Stop refused: …" |
| 14 | Scroll down: Teammate's number, enter `+1 416 555 0199`, Save | "Teammate's number saved"; `416 555 0199` shows the E.164 error in coral under the field |
| 15 | Reset settings | "Settings reset to the defaults"; PINs forgotten, Home goes to Setup step 1 |
| 16 | VoiceOver sweep | Every control has a role and label; motion card reads as one line; each scenario row reads "Scenario N: Name" with the trigger and next step as the hint |
