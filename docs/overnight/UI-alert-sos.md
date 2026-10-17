# UI redesign: Alert + SOS (alert-sos)

Branch `kean/ui-alert-sos`, from `kean/ui-foundation` (ae17118). Run unattended; every open choice took the recommended option and is recorded under Decisions.

## Plan

### Restated

Rebuild the two screens the wearer sees once a check-in has escalated, to `docs/design/screens/Alert.html` and `SOS.html`, from the shared `src/ui` components and tokens:

- **Alert** (`/alert`, phase `escalated`): a coral StatusPill "Alert sent · HH:MM", the heading "Your people have been texted", one row per recipient (letter Avatar, name, when texted, a status word: No reply / On it / Not texted, and "On hold while <name> responds" for those after someone who acknowledged), a phone-side **Summary** card (labelled as a summary, built only from facts the phone has, never a diagnosis), a coral "Call for help" with the demo sub-label that rings only `teammatePhone`, and "I'm okay now" to the PIN gate ("Back to session" once the alert closes).
- **SOS** (`/sos`, phase `sos`): its own screen on `sosBg`: pill "SOS", "No one has answered yet", who was texted, the 232 pt round call button, the caption "Demo mode: calls a teammate, never emergency services", a "Read this out" card (meeting spot, plus self-description), and "I'm okay now".

### Mockup elements and what builds them

| Element | Built from |
| --- | --- |
| Alert pill, SOS pill | `StatusPill` (`alert` tone; `live` once acknowledged, `neutral` once closed) |
| Headings | `Text` with `TEXT.title`, role `header` |
| Recipient rows | `Card padding="list"` + `ListRow` with `Avatar variant="letter"` and a local `RecipientStatusWord` trailing (mint check + "On it", amber "No reply", faint "Not texted") |
| Summary | `InfoCallout title="Summary"` (sunken, blue overline) + a muted "From this phone" footnote |
| Call for help (Alert) | `PrimaryButton tone="coral" size="large" icon="phone"`, caption "Demo: calls a teammate" |
| SOS round button | New local `src/alert/SosCallButton.tsx` (232 pt circle, 10 pt `sosBorder` ring, coral fill, 44 pt phone icon, `TEXT.buttonHuge`) |
| Read this out | `InfoCallout tone="sos" icon="mapPin" title="Read this out"` |
| I'm okay now | `SecondaryButton` (`tone="sos"` on SOS) |

### Data sources

- Phase and trigger: `useSessionState().phase` (`src/session/SessionStateProvider.tsx`); `phase.trigger` is set during `escalated` and `sos`. Words for a trigger come from `TRIGGER_TITLES` semantics in `src/session/describe.ts` (not changed).
- Recipients: `useSessionState().escalation.recipients` (`RecipientStatus { name, kind, notifiedAt, ackedAt }`, `modules/raveguard-native/src/RaveGuardNative.types.ts`), in texting order.
- Title/status: `summarizeAlert` (`src/alert/alertModel.ts`, unchanged API).
- Wearer name, self-description, meeting spot, demo flag, teammate number: `useSettings().settings`.
- Call: `callTarget` / `startCall` in `src/alert/teammateCall.ts` (frozen; the only `tel:` user).

### Risks

| Risk | Mitigation |
| --- | --- |
| The emergency-number scan reads every file under `src/` | No such digits in copy or constants; the SOS caption says "never emergency services"; run the scan test after each change |
| Summary reading like a diagnosis (README rule 2) | Only "may need help", "missed a check-in", "looked like a fall", "still for a while"; titled "Summary" with a "From this phone" footnote; unit tests pin the copy and assert banned words never appear |
| Summary implying the texts said exactly this | Footnote says each person's text depends on what they can see |
| `alertModel` API drift | Only additive exports; `summarizeAlert`, `recipientRows`, `formatClockTime` and their tests unchanged |
| Cross-group anchor "SOS" / "No one has answered yet" | Kept verbatim on the SOS screen |
| 232 pt button overflowing a small phone | Screen keeps scrolling on; spacers are flex-grow so it only scrolls when it must |
| Shared files tempting (e.g. a token for the 232 pt button) | Kept local in `SosCallButton.tsx`; recorded under Shared changes needed |

## What was built

| File | What |
| --- | --- |
| `app/src/screens/AlertScreen.tsx` | Wires session state, settings and the call hook into `AlertView`; "I'm okay now" pushes the PIN gate, "Back to session" dismisses to `/session` |
| `app/src/screens/SosScreen.tsx` | Wires the escalation, settings and the call hook into `SosView` |
| `app/src/alert/AlertView.tsx` | Alert body: pill, heading, live status line, recipient card, Summary callout; footer Call for help + "I'm okay now" (open) or "Back to session" (closed) |
| `app/src/alert/SosView.tsx` (new) | SOS body on `sosBg`: pill "SOS", "No one has answered yet", who was texted, the round button and its caption, "Read this out", "I'm okay now" |
| `app/src/alert/RecipientRow.tsx` | `ListRow` + letter `Avatar` + status word (mint check "On it", amber "No reply", faint "Not texted") |
| `app/src/alert/CallPanel.tsx` | Alert's coral 72 pt `PrimaryButton` "Call for help", caption "Demo: calls a teammate", plus why it is off and the call error |
| `app/src/alert/SosCallButton.tsx` (new) | The 232 pt round coral button inside a 10 pt `sosBorder` ring; disabled look on `sosSurface` |
| `app/src/alert/callCopy.ts` (new) | All Call copy: label, captions, why-off notes, the VoiceOver hint naming the teammate number, the failure line |
| `app/src/alert/useTeammateCall.ts` (new) | One hook for both screens: `callTarget(settings)`, `startCall`, the error; never calls on its own |
| `app/src/alert/phoneSummary.ts` (new) | `phoneSummary(settings, trigger)` (the Summary) and `readThisOut(settings)`; `SUMMARY_FOOTNOTE` |
| `app/src/alert/alertModel.ts` | Additive: `alertRecipients`, `alertSentAt`, `alertPill`, `alertHeading`, `sosTextedLine`, types `AlertRecipient`, `RecipientState`, `AlertPillTone`. `summarizeAlert`, `recipientRows`, `formatClockTime` unchanged |
| `app/__tests__/screens/AlertScreen.test.tsx` | Updated for the new copy (see Tests changed) plus Summary tests |
| `app/__tests__/screens/SosScreen.test.tsx` | Who was texted, SOS background, Call (ready, off, no number, failure, never on its own), Read this out (set and fallback), "I'm okay now" |
| `app/__tests__/alert/alertModel.test.ts` | New model functions; the old tests are untouched |
| `app/__tests__/alert/phoneSummary.test.ts` (new) | Summary per trigger kind, missing facts, no diagnosis words, no sensor numbers, footnote, Read this out |
| `app/__tests__/alert/SosCallButton.test.tsx` (new) | Size, ring, colours, disabled, hint, decorative icon |

`teammateCall.ts` is untouched and still the only file with a `tel:` URL; `noEmergencyNumbers.test.ts` passes.

## Decisions taken on Kean's behalf

1. **Recipient status words**: acknowledged = "On it" (mint, check icon), texted without an ack = "No reply" (amber), not texted = "Not texted" (faint). The line under a not-texted name is "On hold while <first acknowledger> responds" once anyone has acknowledged (an ack stops the chain, PRD WEB-2), "Next if no one replies" while the chain is still running, and "Not needed" once the alert is closed.
2. **VoiceOver row labels** keep the old shape: "Sam, contact. Texted 01:42. No reply yet." / "... On it, acknowledged 01:43." / "Riley, contact. Not texted yet. On hold while Sam responds."
3. **Pill**: "Alert sent · HH:MM" with the time of the first text (no time before any text), "Alert acknowledged" (live tone, mint dot), "SOS" (if the server says `sosOpen` before the phase moves), or the closed title ("Alert resolved" / "Alert cancelled", neutral).
4. **Headings by state**: "Texting your people" (no status yet / pending), "Your people have been texted" (notifying, SOS), "Someone is on it" (acknowledged), "The alert is closed" (resolved / cancelled). The status line from `summarizeAlert` stays under it as a polite live region.
5. **Summary** (the mockup's "What they were sent"): titled "Summary", with the footnote "Written on this phone. Each person's text depends on what they're allowed to see." It says "<name> may need help." then one line per trigger kind ("It looked like a fall at 01:42, and Alex missed the check-in." / "Alex was still for a while before 01:42 and missed the check-in." / "Alex missed a scheduled check-in at 01:42." / "Alex missed a check-in at 01:42."), then "Meeting spot: ..." and the self-description when set. The detector's numbers ("spike 3.1 g") are left out: to a stranger they read like a medical finding. The mockup's "dancing until", "still for 3 minutes" and "no answer to 2 check-ins" are not shown because the phone does not have those facts in JavaScript.
6. **Call copy on Alert**: caption "Demo: calls a teammate" (as the mockup), or "Off outside demo mode" / "No teammate number yet" with the explanation underneath ("Calling is only on in demo mode. RaveGuard never dials emergency services." / "Add your teammate's number on the Debug screen to call from here."). VoiceOver hint: "Rings your teammate's demo number, <number>. iOS asks before it dials." The button is now named "Call for help" (was "Call teammate"), matching both mockups.
7. **SOS caption** "Demo mode: calls a teammate, never emergency services" (no emergency number, per the design fixes), replaced by the why-off note when Call is off. The caption is a visible, readable line; the button's hint says who it rings, so VoiceOver does not read the caption twice.
8. **SOS "who was texted"** comes from the escalation's recipients with a `notifiedAt` ("Maya, Theo and Venue staff were all texted. Call for help if you can."), falling back to "Your people were texted." when the phone has no list.
9. **Read this out**: meeting spot and self-description joined with " · " (trailing full stops dropped). The phone has no location label in JavaScript, so "location label if known" is the meeting spot. With neither set: "Say your name, <name>, and where you are right now."
10. **SOS sizes** (232 pt, 10 pt ring, 44 pt icon) are constants in `SosCallButton.tsx` rather than shared tokens (frozen theme). The heading uses `TEXT.title` (28) instead of the mockup's 30, to stay on the type scale.
11. **SOS layout**: content scrolls only if it must (small phones); the call block grows to sit centred between heading and footer, like the mockup's two spacers. "Read this out" and "I'm okay now" are the footer.

## Shared changes needed

None required. Optional, for the integration step:

- `app/src/ui/theme.ts`: add `TOUCH.sosCall: 232` (and a `SOS_CALL = { size: 232, ringWidth: 10, iconSize: 44 }` token) so the round button's size lives with the other tokens; `SosCallButton.tsx` would then import it instead of its local `SOS_CALL_BUTTON`.

## Contract changes

None. Reads only `phase.trigger`, `escalation.recipients`, and `settings.{wearerName, selfDescription, meetingSpot, demo, teammatePhone}`.

## Tests changed (copy legitimately changed; no behavioural assertion dropped)

- `AlertScreen.test.tsx`: the pill is "Alert sent · 01:42" (asserted by label); not-texted rows now add "Next if no one replies" / "On hold while Sam responds"; the ack row says "On it, acknowledged 01:43"; "Enter PIN to cancel" is now "I'm okay now"; "Call teammate" is now "Call for help", and the demo line "Demo mode: rings your teammate at <number>." moved into the VoiceOver hint (asserted exactly), with the visible caption "Demo: calls a teammate". Every behaviour (lists recipients, ack inside 5 s, relaunch, SOS hand-over, sosOpen, PIN gate stays, Back to session, demo-only dialling, off outside demo, no number, failure, never on its own) is still asserted.
- `SosScreen.test.tsx`: the hint assertion now checks the hint names the teammate number, and the caption "Demo mode: calls a teammate, never emergency services" is asserted as visible text.
- `AlertScreen.test.tsx`, the ack-within-5-s test: it switches to fake timers for itself only, and now unmounts before it switches back. The redesigned screen sits in the shared `Screen`, whose status bar schedules its updates on `setImmediate`; one left over from the fake clock stalled the next test's teardown (hook timeout). The assertions are unchanged.

## Verification

| Check | Result |
| --- | --- |
| `npx jest` | 56 suites, 674 tests, all pass (includes `noEmergencyNumbers.test.ts` and `DuressCancelFrames.test.tsx`) |
| `npx tsc --noEmit` | exit 0 |
| `npx expo lint` | exit 0, no warnings |

No packages added; no prebuild, pods or xcodebuild (the integration step does the simulator build).

## How to test on a phone or the Simulator

Reference: `docs/design/screens/Alert.html` and `SOS.html`. Use Debug's scenario 2 (fall, nobody answers), which walks Check-in → PIN gate → Alert → SOS.

1. **Setup.** In the one-page setup (`/setup`) or the setup steps, set your name (e.g. "Alex"), the self-description (e.g. "Black hoodie, white cap"), a Meeting spot (e.g. "Main stage, left side"), and two or three recipients. On Debug, keep demo mode on and add a teammate number (a real phone you can answer). Expected: Home shows "Tonight, Alex".
2. **Reach Alert.** Start a session, open Debug and run scenario 2; don't answer the check-in or the PIN gate. Expected: the app opens Alert on the dark background; you can't swipe it away.
3. **Alert top.** Expected: a coral pill "Alert sent · HH:MM" (the time of the first text), the heading "Your people have been texted", and a muted line "Texted 1 of 3. Waiting for someone to acknowledge." (Before the server answers: "Texting your people" and "Waiting for the server…", pill without a time.)
4. **Recipient rows.** Expected: one row per recipient in texting order, with a lettered circle (lavender, blue, then dark with a lavender letter), the name, "Texted HH:MM" or "Next if no one replies" underneath, and on the right amber "No reply" or faint "Not texted". With VoiceOver, each row reads as one element: "Maya, contact. Texted 01:47. No reply yet."
5. **Acknowledge.** On Contact 1's phone, open the link and tap Acknowledge. Expected within 5 s: the pill turns to "Alert acknowledged" with a mint dot, the heading "Someone is on it", the status "Maya acknowledged at HH:MM. Help is on the way.", Maya's row shows a mint check and "On it", and each not-yet-texted row says "On hold while Maya responds".
6. **Summary.** Expected: a dark borderless card titled "SUMMARY" (blue) reading "Alex may need help. It looked like a fall at HH:MM, and Alex missed the check-in. Meeting spot: Main stage, left side. Black hoodie, white cap." with the small footnote "Written on this phone. Each person's text depends on what they're allowed to see." It never says "What they were sent", and never a diagnosis.
7. **Call for help (Alert).** Expected: a 72 pt coral button with a phone icon, "Call for help" over "Demo: calls a teammate". Tap it: iOS asks to call the teammate number (only that number). With VoiceOver: "Call for help, button. Demo: calls a teammate. Rings your teammate's demo number, +1…. iOS asks before it dials." On the Simulator it shows "Couldn't start the call. Dial +1… yourself." Turn demo mode off on Debug: the button greys out ("Off outside demo mode") and the line under it says "Calling is only on in demo mode. RaveGuard never dials emergency services."
8. **I'm okay now (Alert).** Tap it. Expected: the PIN gate opens and stays while the alert is still escalated. Enter the safe PIN: "Cancelling…", then "Cancelled. Stay safe." (pin-cancel's screens).
9. **Resolved.** Run scenario 2 again; on a contact's page tap Mark resolved. Expected: the pill "Alert resolved" (neutral), the heading "The alert is closed", rows not texted say "Not needed", Call and "I'm okay now" are gone, and "Back to session" returns to the Active session.
10. **Reach SOS.** Run scenario 2 and let nobody acknowledge until the chain runs out. Expected: SOS opens on its own darker plum background (not swipeable): coral pill "SOS", "No one has answered yet", and "Maya, Theo and Venue staff were all texted. Call for help if you can."
11. **SOS call.** Expected: a 232 pt round coral button in a darker ring, centred, with a big phone icon and "Call for help", and under it "Demo mode: calls a teammate, never emergency services". Tap: iOS asks to call the teammate number. Demo off: the button dims and the caption becomes the "only on in demo mode" line. No screen ever shows an emergency number.
12. **Read this out.** Expected: a plum card with a coral pin icon, "READ THIS OUT" and "Main stage, left side · Black hoodie, white cap". Clear both fields in setup and repeat: "Say your name, Alex, and where you are right now."
13. **I'm okay now (SOS).** Tap the outlined button at the bottom. Expected: the PIN gate opens and stays there while the phase is still SOS.
14. **Small phone / big text.** On an iPhone SE size or with the largest Dynamic Type, Alert and SOS scroll instead of clipping; every button stays at least 44 pt.
