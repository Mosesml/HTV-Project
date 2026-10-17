# UI redesign: setup-home (Setup steps 1–4 + Home)

Branch `kean/ui-setup-home`, from `kean/ui-foundation` (ae17118). Run unattended; every open choice took the recommended option and is recorded under Decisions.

## Plan

### Restated

Replace the four placeholder setup steps and the placeholder Home with the screens in `docs/design/screens/Setup-Contacts.html`, `Setup-Permissions.html`, `Setup-Session.html`, `Setup-PINs.html` and `Home.html`, built from the shared `src/ui` components and tokens. The wizard edits one draft across four routes and saves it once, on "Finish setup", through the same logic the one-page form used (`setupDraft.ts` → `checkSetup`, `useSettings().save`, `usePins().savePins`), so every rule stays as it was: blank rows dropped, at least one contact, phone and name checks, PINs 4–8 digits and different, blank PINs keep the stored ones, ids kept across edits. The wizard adds a "Your name" field (the mockups never collect `wearerName`) and the meeting spot (`Settings.meetingSpot`). Home shows the saved night and starts the session.

### Mockup elements to build

| Screen | Elements |
| --- | --- |
| Step 1, Who gets the alert? | `StepProgress` 1/4, title + intro, **Your name** field (added), recipient rows (numbered `Avatar`, name, "phone · Contact / Venue staff", drag handle), dashed "Add a contact", tap a row to edit (name, phone, Contact / Venue staff, Move up / Move down, Remove), the "never dial emergency services" callout, "Next: who sees what" |
| Step 2, What each person sees | Grid: one column per recipient (letter `Avatar` + short name), rows Get alerts (locked on), See location, Full details, Mark resolved (`Toggle`, "Maya: see location"); "What Theo would get" preview of the least-trusted recipient's brief; Back + "Next: your night" |
| Step 3, Your night | "Check in with me every" `Segmented` 30 / 60 min; "How loud is okay?" `Segmented` (blue) Quieter / Balanced / Louder = 80 / 85 / 90 dB; "What you're wearing" → `selfDescription`; "Meeting spot (optional)" → `meetingSpot`; Back + "Next: your PINs" |
| Step 4, Two PINs | Safe PIN card (mint check chip) and Duress PIN card (lavender lock chip), each with "Change" and `PinDots`; "Change" opens PIN entry (`Keypad` + `PinDots`) in the screen; checks "The two PINs are different" and "Three wrong PINs send the alert right away."; Back + "Finish setup" |
| Home | Wordmark + Settings button; "Tonight, <name>" + "Ready when you are."; rows AirPods (`airPodsConnected`), Check-ins every N min, Alert chain (first names, "Venue staff"), Hearing protection (`onNoise`); Start session (large), "Only starts when you tap. Stop any time.", Debug panel link |

### Data sources

- Draft and save: `app/src/setup/setupDraft.ts` (`draftFromSettings`, `checkSetup`, `rowFieldKey`), `app/src/setup/setupRows.ts` (row edits), `useSettings()` (`app/src/settings/SettingsProvider.tsx`: `settings`, `source`, `problem`, `isLoaded`, `save`), `usePins()` (`app/src/pin/PinStoreProvider.tsx`: `hasPins`, `savePins`), `validatePins` / `PIN_MAX_LENGTH` (`app/src/pin/pinRules.ts`), limits in `app/src/settings/defaults.ts`.
- The draft shared by four routes: a small store in `app/src/setup/setupWizardStore.ts` (`useSyncExternalStore`), because the steps are sibling routes and no provider may be added to the frozen `_layout.tsx`.
- Home: `useSessionState()` (`phase`, `airPodsConnected`), `useSettings().settings` (`wearerName`, `intervalMin`, `recipients`), `useNoiseState()` (`app/src/debug/useNoiseState.ts`, exported API frozen) for hearing protection, `usePins().hasPins`, `RaveGuard.configure` + `startSession`.

### Risks

| Risk | Mitigation |
| --- | --- |
| Four routes share one draft with no shared parent | Module store with a mount count: the draft is created from the saved settings when the flow is entered (step 1 always starts fresh) and dropped when the last step screen unmounts, so nothing leaks between visits or tests |
| Dropping the one-page `/setup` loses tested behaviour | Every behavioural assertion of `SetupScreen.test.tsx` and `SetupFlow.test.tsx` is ported to `__tests__/setup/SetupWizard.test.tsx` before the legacy form goes; `/setup` becomes a redirect to step 1 |
| Drag-to-reorder without a gesture root (`_layout.tsx` is frozen) | Core `PanResponder` + `Animated` on the handle; the target index is a pure, tested function; VoiceOver and visible Move up / Move down do the same move |
| Errors from `checkSetup` belong to different steps | Each step's Next checks only its own keys; Finish checks everything and points at the step that needs fixing |
| Duress safety | No change to the PIN gate or cancel path; setup never reads a PIN back (dots only) |

## What was built

### Screens (`app/src/screens/`)

| File | What |
| --- | --- |
| `SetupContactsScreen.tsx` | Step 1: Your name, the recipient list (`setup/RecipientList.tsx`), the "never dial emergency services" callout, the damaged-settings warning; Back to Home only when editing a saved setup |
| `SetupPermissionsScreen.tsx` | Step 2: `setup/PermissionGrid.tsx` and the "What <name> would get" preview; a note when there is nobody yet |
| `SetupSessionScreen.tsx` | Step 3: interval and loudness `Segmented`s, What you're wearing, Meeting spot (optional) |
| `SetupPinsScreen.tsx` | Step 4: the two `setup/PinCard.tsx`, `setup/PinEntryPanel.tsx` for Change, the two checks, Finish setup (save, then PINs, then Home) |
| `HomeScreen.tsx` | Home to the mockup: wordmark + Settings, "Tonight, <name>", four status rows, PINs-not-set warning, Start session, Debug panel |
| `SetupScreen.tsx` | `/setup` is now a redirect to step 1 (the one-page form is gone) |

### Feature folder (`app/src/setup/`)

| File | What |
| --- | --- |
| `setupWizardStore.ts` | The draft shared by the four routes (`useSyncExternalStore`), started when the first step screen mounts, dropped when the last one unmounts; `keepDraftThroughNavigation()` for a step replacing another |
| `useSetupStep.ts` | Per-step hook: draft, live `checkSetup`, the step's own errors once its Next was pressed, `tryLeave()` |
| `setupSteps.ts` | Which step owns which error key, `firstStepToFix`, `dragTargetIndex` |
| `permissionPreview.ts` | Grid rows and names, least-trusted recipient, the preview text |
| `pinStep.ts` | PIN card states, "different PINs" check, card errors, keypad entry rules |
| `homeStatus.ts` | Home's AirPods, hearing protection and alert-chain words |
| `RecipientList.tsx`, `RecipientListRow.tsx`, `RecipientEditor.tsx` | Step 1's list: closed rows (drag handle via `PanResponder`, VoiceOver Move up / Move down), opened rows (name, phone, Contact / Venue staff, Move up / Move down / Remove / Done), dashed Add a contact |
| `PermissionGrid.tsx`, `PinCard.tsx`, `PinEntryPanel.tsx`, `SmallButton.tsx` | Step 2's grid, step 4's cards and entry, the 44 pt chip button ("Change", "Move up") |
| `SetupStepFooter.tsx` | Gained `backLabel` |
| `setupDraft.ts` | Additive: `meetingSpot` in the draft, saved trimmed, errors keyed `meetingSpot` |
| `setupRows.ts` | Additive: `moveRowDown`, `moveRowTo`, `setRowKind`, `withAlertsOn` |
| Removed | `SetupForm.tsx`, `RecipientCard.tsx`, `PinFields.tsx`, `SetupSummary.tsx` (only the one-page form used them) |

### Tests

- `__tests__/setup/SetupWizard.test.tsx` (new, 32 tests): the whole flow, fresh and editing. Every behavioural assertion of the deleted `SetupFlow.test.tsx` and of the old `SetupScreen.test.tsx` is here against the steps: scenario 7 in one pass (configure, file, both PINs, permissions per recipient), Start session afterwards, missing fields, phone errors on their own row, same number twice, PINs must differ (and the error clears), PINs never shown, interval / loudness / self-description / meeting spot saved, permissions grid, Move up, add / remove / venue staff, edit keeps values and ids, blank PINs keep the stored ones, new PINs while editing, cancel leaves the setup alone, no finishing while a session runs, configure() failing, "Saving…", damaged settings. `Gets alerts` can no longer be switched off (locked on by the design), so that assertion became "locked on and saved as on".
- `__tests__/screens/SetupSteps.test.tsx`: each step's route, title and mockup elements; the "One-page setup" smoke test went with the button.
- `__tests__/screens/SetupScreen.test.tsx`: `/setup` opens step 1 (fresh and saved), and a running session still opens Active session at launch.
- `__tests__/screens/HomeScreen.test.tsx`: greeting, interval, chain (venue staff), AirPods (event and snapshot), hearing protection (snapshot, `onNoise`, "—"), start and refused start, PINs warning, Settings, Debug.
- `__tests__/setup/setupHelpers.test.ts` (new), additions in `setupRows.test.ts` and `setupDraft.test.ts`.

## Decisions taken on Kean's behalf

1. **"Your name" is on step 1**, above the list: the step 2 preview ("Alex missed a safety check-in…") needs it, and it is the first thing a fresh install should ask.
2. **The one-page setup is gone.** `/setup` redirects to step 1; its behaviour tests were ported first (above).
3. **Rows are typed into in place.** A blank or erroring row is open (fields); a filled one closes to the mockup's row with the drag handle; tap to reopen. Keeps scenario 7 (setup in under a minute) to typing, no extra screens.
4. **Reordering**: drag the handle (core `PanResponder`, no gesture root needed), VoiceOver's Move up / Move down on a closed row, and visible Move up / Move down in an opened row.
5. **"Get alerts" is locked on** and a recipient saved with it off is turned back on when setup opens (`withAlertsOn`).
6. **Change opens PIN entry on the same screen** (keypad + dots), not the PIN gate route, so nothing reaches `pinResult`. The entry refuses a PIN equal to the other one straight away. With stored PINs, changing one asks for both ("Change both PINs together"), because the pair can only be checked against each other in the draft.
7. **"Three wrong PINs send the alert right away."** is shown as information; the rule itself is the PIN gate's.
8. **Each step's Next checks only its fields**; Finish checks everything and, if an earlier step is wrong (a deep link), says which and offers "Go to step N".
9. **Finish** saves the settings, then the PINs (as before), then clears the setup steps off the stack and replaces with Home.
10. **The permissions preview** uses the recipient who gets the least (fewest of location and full details), and only says what the text carries; time is when the step opened.
11. **Duress card** names whoever is texted first (the PRD's Contact 1), first name for a contact, full name for venue staff.
12. **Home's AirPods row** keeps the foundation's "Checked when the session starts" while `airPodsConnected` is null (more useful than "—"); **hearing protection** is "—" (VoiceOver: "no reading yet") until `onNoise` or the snapshot. It reads `useNoiseState()` from `src/debug/` (exported API frozen by OWNERSHIP).
13. **Nod copy** on Home: "Whispered in your ear. Nod twice to answer." to match Check-in's "Nod twice".
14. **Settings on Home is disabled while a session runs**, and step 4's Finish is too ("Stop the session to change your setup."), as the old Edit setup was.
15. **Home warns when the PINs aren't set** (the old summary's "PINs not set").
16. **44 pt minimum**: the mockup's 36 pt "Change" is a 44 pt `SmallButton`; the drag handle is 44 pt.
17. Loudness saved outside 80 / 85 / 90 by the old form shows no segment selected and "Set to 92 dB before. Pick one to change it."

## Contract and shared changes

None made, none required. Nice to have later (not needed now):

- A `app/src/app/setup/_layout.tsx` with a provider would scope the draft to the flow instead of `setupWizardStore.ts`'s module store.
- `src/ui/TextButton` has no `accessibilityLabel` prop, hence the local `SmallButton`.

## Phone / Simulator test guide

The mockups in `docs/design/screens/` are the reference.

1. **Fresh install** (or Debug → Reset settings, then back): the app opens on "STEP 1 OF 4 / Who gets the alert?", dark, no Back button. Three open rows (Contact 1, Contact 2, Venue staff 3) with Name / Phone fields, a dashed "Add a contact", the blue phone callout.
2. Tap **Next: who sees what** with nothing filled: red "Enter your name", "Add at least one contact to text", and "Fix the fields marked in red to go on." above the button; you stay on step 1.
3. Fill **Your name** (Alex), two contacts and venue staff; tap **Done** on each: rows close to the mockup's look (numbered chip lavender / blue / dark, "phone · Contact", grip dots on the right).
4. **Drag** row 2's grip above row 1: it lifts (lavender border), follows your finger, and drops in the new place; numbers renumber. The list doesn't scroll while you drag.
5. **VoiceOver** on a closed row: swipe up/down for "Move up" / "Move down" actions; double-tap opens the row. Opened row shows Move up / Move down / Remove (44 pt).
6. **Next**: step 2 grid with letter avatars (M / T / V), four rows, "Get alerts" toggles locked (muted lavender, "Always on"). Toggle Theo's See location: the bottom card "WHAT THEO WOULD GET" changes from "No location, no details." to "With your location, no other details."
7. **Next**: step 3. 30 min selected (lavender), Balanced selected (blue). Pick 60 min and Louder; type what you're wearing and a meeting spot ("(optional)" in the label).
8. **Next**: step 4. Two cards, dots empty, "Set" buttons; "The two PINs must be different" (muted) and "Three wrong PINs…". Tap **Set** on Safe PIN: a keypad screen "New safe PIN"; type 4 digits (dots fill, no digits shown), **Use this PIN**: back on the cards, dots filled. Set the duress PIN to the same digits: "Must be different from your safe PIN"; change one digit, Use: the check turns mint, "The two PINs are different".
9. **Finish setup**: Home. "Tonight, Alex", "Ready when you are.", rows AirPods ("Checked when the session starts"), "Check-ins every 60 min", "Alert chain Maya → Theo → Venue staff", "Hearing protection" (Off / Bridge · connected, per Debug's backend), Start session (72 pt lavender), caption, Debug panel.
10. **Start session**: Active session opens once Swift reports monitoring; the AirPods row reads Connected / Not connected after the session starts.
11. **Settings** (sliders, top right) from Home: step 1 with the saved values and closed rows, "Back to Home" in the footer. Change the name, Back to Home: nothing changed. Go through again, leave PINs alone ("Your PINs are set…", cards show "Change"), Finish: Home shows the new name, the old PINs still cancel.
12. Settings → step 4 → change only the safe PIN → Finish: "Change both PINs together" under the duress card.
13. `/setup` (an old link) lands on step 1.

Needs a device or Simulator (not covered by Jest): the drag gesture itself (4) and that it doesn't fight the scroll view, VoiceOver's actions (5), keyboard behaviour on the text fields, the font rendering.

## Verification

| Check | Result |
| --- | --- |
| `npx jest` | 55 suites, 680 tests, all pass |
| `npx tsc --noEmit` | exit 0 |
| `npx expo lint` | exit 0 |
| Simulator build | not run here (the integration step does the one build); no native or package changes |
