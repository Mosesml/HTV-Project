# UI redesign: file ownership

> **Historical.** This split applied while the six groups worked in parallel. All six branches are merged into `kean/ui-redesign` (see `docs/overnight/UI-SUMMARY.md`), the legacy files named below are gone, and `src/ui/` is no longer frozen. The cross-group anchors at the end still hold.

Six screen groups build the redesign in parallel, each on its own branch (`kean/ui-<group>`, from `kean/ui-foundation`) in its own worktree (`HTV-ui/<group>`). Each group edits **only** the files listed for it below. Everything else is **shared and frozen**: if your screen needs a shared change, don't make it; list it under `sharedChangesNeeded` in your report and work around it inside your own files.

Paths are relative to the repo root. "New files in a folder" means a group may add files there; the folder's other files stay as listed.

## setup-home

| Kind | Files |
| --- | --- |
| Screens | `app/src/screens/HomeScreen.tsx`, `app/src/screens/SetupContactsScreen.tsx`, `app/src/screens/SetupPermissionsScreen.tsx`, `app/src/screens/SetupSessionScreen.tsx`, `app/src/screens/SetupPinsScreen.tsx`, `app/src/screens/SetupScreen.tsx` (the one-page legacy form at `/setup`: once the four steps work it may become `<Redirect href={ROUTES.setupContacts} />`; the route file stays) |
| Feature folder | `app/src/setup/` (all of it: `SetupForm.tsx`, `RecipientCard.tsx`, `PinFields.tsx`, `SetupSummary.tsx`, `SetupStepFooter.tsx`, `setupDraft.ts`, `setupRows.ts`, and new files) |
| Tests | `app/__tests__/screens/HomeScreen.test.tsx`, `app/__tests__/screens/SetupSteps.test.tsx`, `app/__tests__/screens/SetupScreen.test.tsx`, `app/__tests__/setup/` (all of it, and new files) |

## active

| Kind | Files |
| --- | --- |
| Screens | `app/src/screens/SessionScreen.tsx` |
| Feature folder | `app/src/activeSession/` UI files: `ProtectionControl.tsx`, `ReadingTile.tsx`, new files. `readings.ts` may gain functions; `useProtectionLevel.ts`, `levelSender.ts` and `protectionState.ts` keep their exported API |
| Tests | `app/__tests__/screens/SessionScreen.test.tsx`, `app/__tests__/activeSession/` (all of it, and new files) |

## checkin

| Kind | Files |
| --- | --- |
| Screens | `app/src/screens/CheckInScreen.tsx` |
| Feature folder | `app/src/checkIn/`: `CheckInView.tsx`, `CountdownRing.tsx` (the old tick ring; replace its use with `ui/CountdownRing` and delete it with its test), `stages.ts` (copy, may change), new files. `countdown.ts` keeps its exported API |
| Tests | `app/__tests__/screens/CheckInScreen.test.tsx`, `app/__tests__/checkIn/` (all of it, and new files) |

## pin-cancel

| Kind | Files |
| --- | --- |
| Screens | `app/src/screens/PinEntryScreen.tsx` (the PIN gate, with "Cancelling…" and "Cancelled. Stay safe." in the same route) |
| Feature folder | `app/src/pin/` UI files only: `CancelView.tsx` and new `.tsx` files. The logic stays frozen: `pinStore.ts`, `securePinStore.ts`, `pinHash.ts`, `pinRules.ts`, `PinStoreProvider.tsx`, `useCancelSequence.ts`, `cancelSequence.ts`, `pinFeedback.ts` |
| Tests | `app/__tests__/screens/PinEntryScreen.test.tsx`, `app/__tests__/screens/DuressCancelFrames.test.tsx` (update how the PIN is entered, e.g. keypad presses; keep every frame-for-frame and haptic assertion), `app/__tests__/pin/CancelView.test.tsx`, new UI tests in `app/__tests__/pin/` |

## alert-sos

| Kind | Files |
| --- | --- |
| Screens | `app/src/screens/AlertScreen.tsx`, `app/src/screens/SosScreen.tsx` |
| Feature folder | `app/src/alert/` UI files: `AlertView.tsx`, `RecipientRow.tsx`, `CallPanel.tsx`, new files. `alertModel.ts` may gain functions (the phone-side "Summary") but keeps its exported API. `teammateCall.ts` is frozen: it is the only file allowed a `tel:` URL |
| Tests | `app/__tests__/screens/AlertScreen.test.tsx`, `app/__tests__/screens/SosScreen.test.tsx`, `app/__tests__/alert/alertModel.test.ts`, new UI tests in `app/__tests__/alert/` |

## debug

| Kind | Files |
| --- | --- |
| Screens | `app/src/screens/DebugScreen.tsx` |
| Feature folder | `app/src/debug/` (all of it, and new files; `scenarios.ts`, `useDebugRunner.ts`, `useNoiseState.ts` and `useSimulatedOffline.ts` keep their exported API) |
| Tests | `app/__tests__/screens/DebugScreen.test.tsx`, `app/__tests__/debug/` (all of it, and new files) |

## Shared and frozen (no group edits these)

- **Design system:** `app/src/ui/` (tokens in `theme.ts`, `fonts.ts`, `icons.ts`, every component, `README.md`).
- **Routes and navigation:** `app/src/app/` (every route file and `_layout.tsx`), `app/src/navigation/` (`phaseNavigation.ts`, `PhaseNavigator.tsx`, `HomeRoute.tsx`).
- **Providers, stores and models:** `app/src/session/`, `app/src/settings/`, the pin logic listed above, `app/src/alert/teammateCall.ts`, `app/src/checkIn/countdown.ts`.
- **Native module:** `app/modules/raveguard-native/` (types, `index.ts`, mock, Swift).
- **Config and tooling:** `app/package.json`, `app/package-lock.json`, `app/app.json`, `app/app.config.ts`, `app/jest.setup.ts`, `app/tsconfig.json`, `app/eslint.config.js`, `app/test-utils/`.
- **Shared tests:** `app/__tests__/ui/`, `app/__tests__/navigation/`, `app/__tests__/session/`, `app/__tests__/settings/`, `app/__tests__/raveguard-native.test.ts`, `app/__tests__/app.config.test.ts`, `app/__tests__/alert/noEmergencyNumbers.test.ts`, `app/__tests__/alert/teammateCall.test.ts`, the logic tests in `app/__tests__/pin/` (`pinHash`, `pinRules`, `pinStore`, `securePinStore`, `PinStoreProvider`, `useCancelSequence`).
- **Docs:** `docs/design/` (this file, the brief, the mockups), `WORK_ORDER.md`, `PRD.md`, `app/README.md`. Write your notes in `docs/overnight/UI-<group>.md` (yours alone).

## Cross-group anchors

Some tests reach another group's screen. They assert routes (`app.getPathname()`) wherever they can; these few strings are relied on across groups, so keep them:

| Owner | Keep | Relied on by |
| --- | --- | --- |
| setup-home | Home shows `Tonight, {wearerName}` and a button named "Start session" that sends `configure()` then `startSession()` | `DebugScreen.test.tsx` (sample settings survive a relaunch) |
| checkin | The Check-in heading "Are you okay?" (role `header`) | `SessionScreen.test.tsx` (a check-in opens Check-in) |
| alert-sos | SOS shows "SOS" and "No one has answered yet" | `AlertScreen.test.tsx` (hands over to SOS) |
| everyone | `StepProgress` ("Step 1 of 4") stays on Setup step 1 | `navigation/HomeRoute.test.tsx` |
| active | Active session keeps a "Session running" heading (role `header`, read only by VoiceOver) | `SessionScreen.test.tsx`; gives VoiceOver's rotor a heading on the screen |

## Rules for every group

- Build from `app/src/ui/` (read its README); no hex values, font names or raw sizes in screens.
- Keep the logic interfaces stable: `useSessionState`, `useSettings`, `usePins`, `useSessionReadings`, `useProtectionLevel`, `useCancelSequence`, and the settings, PIN, session, check-in and alert model functions. New screens consume them.
- Keep the duress rule, the no-emergency-number scan, "—" for null hearing values, one Check-in component, no session logic in React Native, and accessibility labels, roles and values. Update a test whose copy or structure legitimately changed; never delete a behavioural assertion to make it pass.
- Run `npx jest`, `npx tsc --noEmit` and `npx expo lint` in `app/` before you push. Push only your own branch: `git push -u origin kean/ui-<group>`.
