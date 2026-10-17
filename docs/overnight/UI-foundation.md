# UI foundation (redesign)

Branch `kean/ui-foundation`, from `origin/main` (a60976f). Run unattended; every open choice took the recommended option and is recorded under Decisions.

## Plan

### Restated

Build everything the six parallel screen groups (setup-home, active, checkin, pin-cancel, alert-sos, debug) share, so none of them has to touch a shared file: the design tokens and type scale from `docs/design/README.md`, the fonts and SVG packages, about twenty shared components with tests and a README, the routes and phase navigation for the new screen set with placeholder screens, three approved contract changes (check-in trigger, AirPods connection, meeting spot), and a file-ownership map. Keep every logic interface and behavioural test (duress rule, no emergency numbers, "—" for null hearing, one Check-in component, no session logic in React Native, accessibility).

### Grounded in what exists

- Tokens: `app/src/ui/theme.ts` held the old light palette (`COLORS`, `TYPE`, `LAYOUT`, `MIN_TAP_TARGET`, `CHECK_IN_BUTTON_HEIGHT`) used by every current screen and by `SessionScreen.test.tsx`, so the new tokens go in the same file beside a LEGACY block that keeps those exports.
- Routes: `app/src/app/*.tsx` are one-line re-exports of `app/src/screens/*`; `app/src/app/_layout.tsx` stacks them under the providers and `PhaseNavigator`.
- Navigation: `app/src/navigation/phaseNavigation.ts` is a pure function (previous phase, next phase, pathname) with unit tests; it reacts to changes only, which is what keeps the duress rule ("Cancelled. Stay safe." stays up after either PIN).
- Duress: `app/__tests__/screens/DuressCancelFrames.test.tsx` records `/pin` at 60 fps for both PINs and expects pathname `/pin` throughout.
- Native seam: `app/modules/raveguard-native/` (types, `index.ts`, `src/mock.ts`, `RaveGuardModule.swift`, `ios/Module/RaveGuardRuntime.swift`). `SessionManager` (Justin's) records every trigger in the session log as `"<kind>: <reason>"` and then `.checkInStarted` with the kind, and the motion source's streams come from `MotionBroadcast`, which gives every reader its own stream.
- Settings: `app/src/settings/validateSettings.ts` mirrors Swift's `ModuleSettings` plus length limits.

### Phases

1. Commit `docs/design/` as-is.
2. Tokens, fonts (`@expo-google-fonts/*`), `react-native-svg`; Jest support.
3. Components in `app/src/ui/` with tests; `app/src/ui/README.md`.
4. Contract changes, TypeScript and Swift together, tests on both sides.
5. Routes, navigation rules, placeholder screens and smoke tests; fix the tests whose routes legitimately moved.
6. `docs/design/OWNERSHIP.md`, docs.
7. Verify (Jest, tsc, lint, `swift test`, prebuild + pods + simulator build), commit, push, create the six worktrees.

### Risks

| Risk | Mitigation |
| --- | --- |
| Moving Setup off `/` breaks the Setup, SetupFlow, Session and Debug tests | The one-page form stays reachable at `/setup`; tests point there, or assert the new route (Home) |
| Routing `sos` to its own screen breaks Alert's SOS tests | Alert's Call tests render `escalated` (same Call); SOS gets its own Call tests with the same demo-only rule |
| A cancel-confirmation route would add navigation frames to the duress recording | Keep Cancelling / Cancelled inside `/pin` (decision 1) |
| A required `trigger` field breaks every `PhaseEvent` literal | Update the shared `PHASES` fixtures once (trigger on check-in, escalated and SOS phases, null otherwise) |
| Reading AirPods from the motion source steals `SessionManager`'s stream | `MotionBroadcast` hands each reader its own stream; a Swift test covers it alongside the session |
| Groups editing each other's tests | Cross-screen assertions became route assertions; the few strings still relied on are listed as anchors in OWNERSHIP.md |
| The emergency-number scan covers `src/ui` too | Found and fixed one: a pill radius of 999 (now 500) |

## What was built

### Tokens, type and fonts

- `app/src/ui/theme.ts`: `PALETTE` (all 16 README tokens plus 14 named mockup colours), `STAGE_COLORS`, `STAGE_BAR_COLORS`, `RECIPIENT_COLORS`/`recipientColor`, `FONTS`, `TEXT` (the type scale, tabular numerals on timers and dB), `SCREEN_PADDING`/`screenPadding(insets)`, `SPACE`, `RADII`, `TOUCH` (44 / 60 / 56 / 72 / 96 / 72), `RING` (240, 12), `ICON` (24 viewBox, 1.8 stroke), `HOLD_TO_CONFIRM_MS` (1000). The old exports stay in a LEGACY block until the screens move.
- `app/src/ui/fonts.ts`: Sora 500/600/700, Manrope 400/500/600/700, JetBrains Mono 500/600, imported per weight. `_layout.tsx` keeps the splash screen up until they load (or fail, then system font with a warning). `jest.setup.ts` mocks `useFonts` as loaded.
- `react-native-svg` 15.15.4 (native; prebuild + pods done).
- `app.json`: `userInterfaceStyle` dark, splash background `#14122B`.

### Components (`app/src/ui/`, barrel `index.ts`, README with props and examples)

`Screen`, `PrimaryButton`, `SecondaryButton`, `HoldToConfirmButton`, `IconButton`, `TextButton`, `Card`, `ListRow`, `IconChip`, `Toggle` (with locked-on), `Segmented` (accent), `StepProgress`, `StageBar`, `CountdownRing`, `Ring`, `ProgressBar`, `Keypad`, `PinDots`, `StatusPill`, `StatusDot`, `Avatar`, `MetricTile`, `InfoCallout`, `TextField`, `SectionLabel`, `Icon` + 22 icons (`icons.ts`), `NO_VALUE`/`NO_VALUE_SPOKEN`. Tests: `app/__tests__/ui/` (theme, icons, buttons, controls, progress, display).

### Routes and navigation

| Route | Screen file | Owner |
| --- | --- | --- |
| `/` | `navigation/HomeRoute.tsx` (gate) → `screens/HomeScreen.tsx` | gate shared; Home setup-home |
| `/setup/contacts`, `/setup/permissions`, `/setup/session`, `/setup/pins` | `screens/SetupContactsScreen.tsx`, `SetupPermissionsScreen.tsx`, `SetupSessionScreen.tsx`, `SetupPinsScreen.tsx` | setup-home |
| `/setup` | `screens/SetupScreen.tsx` (one-page legacy form) | setup-home |
| `/session` | `screens/SessionScreen.tsx` | active |
| `/check-in` | `screens/CheckInScreen.tsx` | checkin |
| `/pin` | `screens/PinEntryScreen.tsx` (+ Cancelling / Cancelled) | pin-cancel |
| `/alert` | `screens/AlertScreen.tsx` | alert-sos |
| `/sos` | `screens/SosScreen.tsx` | alert-sos |
| `/debug` | `screens/DebugScreen.tsx` | debug |

`ROUTES` keys: `home`, `setupContacts`, `setupPermissions`, `setupSession`, `setupPins`, `setupLegacy`, `session`, `checkIn`, `pin`, `alert`, `sos`, `debug` (`ROUTES.setup` is gone; `SETUP_STEP_ROUTES` and `isSetupRoute` are new).

Phase rules (`phaseNavigation.ts`): `checkIn` whisper/loud → Check-in; `pinGate` → PIN gate; `escalated` → Alert; `sos` → SOS (replacing the PIN gate or Alert, pushing elsewhere); `monitoring` → Active session (from Check-in after a nod or tap, at launch over Home or setup, and when Start session on Home is answered with `monitoring`); `idle` → Home (from Active session after Stop); Home sends a fresh install to Setup step 1. Unchanged duress-safe rules: only changes navigate, and `monitoring` never moves the wearer off the PIN gate, Alert or SOS.

The stack has no navigation header now; each redesigned screen draws its own Back/Settings/Debug buttons, and iOS's edge swipe still works where allowed (Check-in, Alert, SOS stay locked).

Placeholders (each built from the new components, each with a smoke test): Home (`__tests__/screens/HomeScreen.test.tsx`), the four setup steps (`SetupSteps.test.tsx`), SOS (`SosScreen.test.tsx`, including its demo-only Call). The gate: `__tests__/navigation/HomeRoute.test.tsx`.

## Decisions (recommended options, taken unattended)

1. **Cancelling / Cancelled stay inside the PIN route** (`/pin`, `src/pin/CancelView.tsx`) rather than a route of their own: no navigation can then differ between the PINs, and the frame-for-frame duress test stays as simple as it is. `CancelConfirm` from the brief is `CancelView`.
2. **The one-page setup stays at `/setup`** until the four steps replace it, reachable from Setup step 1 ("One-page setup"), so the app can still be set up mid-redesign. setup-home may later turn `SetupScreen.tsx` into a redirect to step 1.
3. **Home doesn't navigate on Start session**; `PhaseNavigator` opens Active session when Swift reports `monitoring` (the screen follows `onPhase`). Active session still navigates to Home itself after a successful Stop, as before; the `idle` rule is the same move, so whichever lands first wins and the other is a no-op.
4. **The `/` gate lives in shared navigation** (`HomeRoute.tsx`): Home with saved settings, a redirect to Setup step 1 otherwise. Redirect only acts while `/` is focused, so a check-in open at launch isn't replaced.
5. **SOS has its own screen** and Call: the same `teammateCall.ts` rule (demo mode rings the teammate, otherwise off). Caption: "Demo mode: calls a teammate, never emergency services" (the mockup's emergency number removed).
6. **One ring size** (240 / 12) for every stage; the mockups drew 240 and 220.
7. **One icon stroke** (1.8, round caps and joins); the mockups mixed 1.8 to 2.4.
8. **Nod copy**: use one line on both stages, "Nod twice, or tap below." (the detector wants two pitch reversals; the whisper mockup said this, the loud one said "Nod, or tap below."). checkin owns the copy in `src/checkIn/stages.ts`.
9. **AirPods state is `boolean | null`**: null until the motion source reports (it does once a session starts), so Home before a session says "Checked when the session starts" instead of guessing.
10. **Trigger titles** (`describeTrigger` in `src/session/describe.ts`): fall "Looked like a fall", stillness "You've been still for a while", scheduled "Scheduled check-in", manual "Check-in". None claims a diagnosis.
11. **Meeting spot**: required `string` in the type (empty = not set) so screens never handle undefined; optional at both boundaries (a file or a `configure()` without it reads as empty); 120 characters (`MAX_MEETING_SPOT_LENGTH`).
12. **Pill radius 500**, not 999: the emergency-number scan (rightly) flags `999`.
13. **Stack without headers**, `userInterfaceStyle` dark, dark splash.
14. **Touch targets**: the 28 pt toggle track uses `hitSlop` to reach 44; `IconButton` never goes under 44; `TextButton` pads to 44.

## Contract changes (approved by the team)

| # | Change | Where |
| --- | --- | --- |
| a | `PhaseEvent.trigger: CheckInTrigger \| null` (`{ kind: 'scheduled' \| 'fall' \| 'stillness' \| 'manual', reason, at }`), appended. Set while `checkIn`, `escalated`, `sos`; null while `idle`, `monitoring` (so a duress PIN still matches a safe one). Also in `getSnapshot().phase` | `RaveGuardNative.types.ts`, `mock.ts`, `ios/Module/TriggerTrackingLog.swift` (new: wraps the session log, promotes the `.trigger` entry when `.checkInStarted` follows), `RaveGuardRuntime.swift` (adds it to Justin's payload). **`SessionManager` unchanged** |
| b | New event `onAirPods: { connected: boolean }` (appended to `RaveGuardEvents` and `RaveGuardRuntime.Event`); `Snapshot.airPodsConnected: boolean \| null`, appended | Types, mock, runtime (reads its own stream of the motion source's `airPodsConnected`, emits on change); `RaveGuardModule.swift` picks the event up from `Event.allCases` |
| c | `Settings.meetingSpot: string`, appended; defaults `''`; validated (string, ≤ 120, missing/null → `''`); sample settings carry one | Types, `settings/defaults.ts`, `validateSettings.ts`, `sampleSettings.ts`, Swift `ModuleSettings.meetingSpot` (via a new `ModuleFields.optionalString`) |

Tests: Swift `RuntimeTriggerAndAirPodsTests.swift` (kind, reason and time for fall, manual, scheduled and motion-source triggers; trigger kept through the ladder and escalation; a second trigger doesn't replace the open one; null on monitoring/idle and identical keys after safe and duress; AirPods unknown → connected → disconnect/reconnect once each) and `TriggerTrackingLogTests`; `ModuleSettingsTests` (meeting spot decoded, optional, typed). JavaScript: `raveguard-native.test.ts`, `validateSettings.test.ts`, `session/SessionStateProvider.test.tsx`, `session/describeTrigger.test.ts`.

Where screens read them:

- Trigger: `useSessionState().phase?.trigger`; words from `describeTrigger(trigger)`.
- AirPods: `useSessionState().airPodsConnected`.
- Meeting spot: `useSettings().settings.meetingSpot`.

## Tests changed (copy or structure legitimately changed; no behavioural assertion dropped)

- `navigation/phaseNavigation.test.ts`: rewritten for the new routes (SOS, Home, idle → Home, start on Home, setup routes at launch); every old rule still asserted.
- `screens/SetupScreen.test.tsx`, `setup/SetupFlow.test.tsx`: the one-page form at `/setup`.
- `screens/SessionScreen.test.tsx`: Stop returns to Home (and to Setup step 1 when nothing is saved).
- `screens/AlertScreen.test.tsx`: `sos` now hands over to the SOS screen; Alert's Call tests render `escalated`.
- `screens/DebugScreen.test.tsx`: the relaunch shows Home ("Tonight, …").
- Cross-screen copy checks ("Session running", "onMotion", the PIN field) became route checks, so groups don't break each other.

## How to test

```bash
cd app
npx jest                 # 54 suites, 641 tests
npx tsc --noEmit
npx expo lint
cd modules/raveguard-native/ios && swift test   # 135 tests, 17 suites
cd app && npx expo prebuild --platform ios && cd ios && pod install
xcodebuild -workspace RaveGuard.xcworkspace -scheme RaveGuard -configuration Debug -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' build -quiet
```

On the phone: a fresh install opens on Setup step 1 (dark); "One-page setup" saves settings; Home shows "Tonight, <name>", the AirPods row and Start session; Debug → scenario 2 walks Check-in → PIN gate → Alert → SOS.

## Verification

| Check | Result |
| --- | --- |
| `npx jest` | 54 suites, 641 tests, all pass |
| `npx tsc --noEmit` | exit 0 |
| `npx expo lint` | exit 0 |
| `swift test` | 135 tests in 17 suites pass |
| `expo prebuild --platform ios` + `pod install` + simulator `xcodebuild` (iPhone 18 Pro) | exit 0 (only the harmless `-quiet` "failed with exit code 0" lines) |
