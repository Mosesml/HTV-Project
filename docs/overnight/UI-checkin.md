# UI redesign: Check-in (whisper + loud)

Branch `kean/ui-checkin`, from `kean/ui-foundation` (ae17118). Run unattended; every open choice took the recommended option and is recorded under Decisions.

## Plan

### Restated

Rebuild the Check-in screen (`/check-in`) to match `docs/design/screens/CheckIn-Whisper.html` and `CheckIn-Loud.html` as **one** component for both stages (brief rule 5), built from the shared `src/ui` components and tokens. The old 60-tick `View` ring goes; the foundation's SVG `CountdownRing` replaces it. Keep everything the screen does today: it follows `onPhase`, "I'm okay" calls `tapCancel`, a failed cancel says so and leaves the button up, the PIN gate opens through the phase navigation (with an "Enter PIN" way through if the screen is still up), and VoiceOver reads the ring as one progress bar whose value is "N seconds left".

### Mockup elements to build

| Element | Whisper | Loud | Built from |
| --- | --- | --- | --- |
| Three-step ladder | Whisper active (lavender) | Whisper done, Louder active (amber) | `StageBar` |
| What started it | Uppercase label ("Scheduled check-in") | Card: warning icon, title ("Looked like a fall") and the detector's reason | `TEXT.overline`; `InfoCallout variant="card" tone="warning"` |
| Countdown | 240 pt ring, lavender | Same 240 pt ring (the mockup's 220 unified), amber | `CountdownRing` (`STAGE_COLORS`) |
| Heading | "Are you okay?" (`header`) | same | `TEXT.titleLarge` |
| Stage line | Speaker icon, "Whispering in your AirPods" (blue) | Vibrate icon, "Louder prompt and vibrating" (amber) | `Icon`, `TEXT.bodyStrong` |
| Nod copy | "Nod twice, or tap below." | "Nod twice, or tap below. After this you'll need your PIN." | `TEXT.body` |
| Button (pinned at the bottom) | 96 pt lavender "I'm okay" / "Cancel the check-in" → `tapCancel` | same | `PrimaryButton size="huge"` in the `Screen` footer |

### Data sources

- Phase, stage and stage end: `useSessionState()` (`app/src/session/SessionStateProvider.tsx`): `phase.stage`, `phase.stageEndsAt`, `phaseSeenAt`.
- Ring maths: `stageCountdown()` in `app/src/checkIn/countdown.ts` (exported API unchanged).
- Trigger: `useSessionState().phase.trigger` (`CheckInTrigger | null`), worded by `describeTrigger()` in `app/src/session/describe.ts`.
- Cancel: `tapCancel()` from `app/modules/raveguard-native`.
- PIN gate: `PhaseNavigator` (`app/src/navigation/phaseNavigation.ts`) replaces Check-in with `/pin` on `pinGate`; the screen's own "Enter PIN" does `router.replace(ROUTES.pin)`.

### Risks

| Risk | Mitigation |
| --- | --- |
| Renaming the button from "Cancel" to "I'm okay" breaks tests elsewhere | Only `CheckInScreen.test.tsx` and `CheckInView.test.tsx` press it (both mine); `SessionScreen.test.tsx` relies only on the "Are you okay?" header anchor, which stays |
| The loud layout (card + 240 ring + 96 pt button) overflows a 667 pt iPhone SE with `scroll={false}` | Both stages switch to one compact ring (196 pt) on screens under 720 pt tall; same size for both stages, so the ring never jumps between stages |
| Deleting the tick ring loses the drain assertions | Rewrite them against the SVG ring: the progress bar's `now` value, the arc's colour and the arc disappearing at zero |
| The trigger detail repeats the title (Swift's scheduled reason is "scheduled check-in") | Drop the detail when it says the same as the title |
| `litTicks` / `RING_TICKS` become unused | `countdown.ts` keeps its exported API (frozen); its own tests still cover them |

## What was built

| File | What |
| --- | --- |
| `app/src/checkIn/CheckInView.tsx` | Rewritten: one component for every stage, inside `Screen scroll={false}`. `StageBar`, the trigger note (label on whisper, `InfoCallout` card on loud and at the PIN gate), the shared SVG `CountdownRing`, "Are you okay?" (`header`), the stage line with its icon, the nod copy, and the 96 pt `PrimaryButton` ("I'm okay" / "Cancel the check-in") pinned in the footer with the error above it. New prop: `trigger` |
| `app/src/screens/CheckInScreen.tsx` | Passes `phase.trigger` to the view; drops its own `SafeAreaView`/`StatusBar` (`Screen` does both); error copy now names the new button |
| `app/src/checkIn/stages.ts` | Per stage: StageBar word, stage line, icon and colour, nod copy, ring colour (`STAGE_COLORS`), `showsTriggerCard`, `canCancel`. `NOD_COPY` exported. `STAGES`, `STAGE_COUNT`, `stageTitle` kept |
| `app/src/checkIn/triggerCopy.ts` (new) | `triggerCopy(trigger)`: title and detail from the shared `describeTrigger`, plus an icon; drops a detail that repeats the title. `NO_TRIGGER_LABEL` |
| `app/src/checkIn/ringSize.ts` (new) | `checkInRingSize(height)`: 240 pt (`RING.size`), or 196 pt for both stages on windows under 720 pt tall |
| `app/src/checkIn/CountdownRing.tsx` | Deleted (the old 60-tick ring), with `__tests__/checkIn/CountdownRing.test.tsx` |
| `app/__tests__/checkIn/CheckInView.test.tsx` | Rewritten for the SVG ring and the new layout (19 tests) |
| `app/__tests__/checkIn/stages.test.ts` | Rewritten for the new stage data |
| `app/__tests__/checkIn/triggerCopy.test.ts` (new) | Trigger words, icons, the repeat rule, no diagnosis, ring sizes |
| `app/__tests__/screens/CheckInScreen.test.tsx` | Rewritten: the ring's drain and refill now asserted through the progress bar's value, the SVG arc's colour and its disappearance at zero; the loud trigger card from `onPhase`; every navigation test kept |

`countdown.ts` is untouched (its `litTicks` / `RING_TICKS` are now unused by the screen but stay as exported API, still covered by `countdown.test.ts`).

### Tests changed, and why

- "Cancel" became "I'm okay" (with the caption "Cancel the check-in"), per the mockups. Every Cancel assertion (calls `tapCancel`, 96 pt, full width, hint, last on screen, failed cancel leaves it up, absent at the PIN gate, present before the stage is known) is kept against the new name. The old "at least 60 pt" check is now the stricter `TOUCH.checkIn` (96).
- Stage titles: "Loud" / "PIN gate" became the StageBar's "Louder" / "PIN"; they are now asserted as the StageBar's accessibility label.
- Lit-tick counts became the progress bar's `now` value (100 → 50 → 0) plus the arc's colour and its removal at zero.
- "Leaves the ring out while the stage end is unknown" became "stays full with a dash and says 'Waiting for the timer'" (see decision 3): a deliberate design change, not a dropped check.

## Decisions taken on Kean's behalf

1. **"I'm okay" keeps its words as the accessible name**; the caption "Cancel the check-in" and the hint "Tells RaveGuard you're okay, the same as a nod." are read after it.
2. **Trigger placement**: whisper shows the trigger title as the mockup's small uppercase label; loud (and the PIN-gate stage, should the screen still be up) shows the card with the detector's reason. No trigger: whisper says "Check-in", loud shows no card.
3. **Unknown stage end**: the ring is drawn full with "—" and VoiceOver hears "Waiting for the timer", so the layout never jumps when the first `stageEndsAt` arrives (the foundation's `CountdownRing` supports exactly this).
4. **One ring size** (240) for both stages (the loud mockup drew 220). On short screens (under 720 pt, i.e. iPhone SE) both stages use 196 so "I'm okay" stays on screen without scrolling.
5. **Nod copy**: "Nod twice, or tap below." on both stages; loud adds "After this you'll need your PIN." from its mockup.
6. **Stage line colours**: whisper's line is blue (as drawn in the mockup, with the ring lavender); loud's is amber.
7. **Trigger card icons**: fall and stillness `warning`, scheduled `clock`, manual `info`; the card stays amber (`tone="warning"`) on loud.
8. **Repeated detail dropped**: Swift's scheduled reason ("scheduled check-in") is the title again, so the card shows the title only.
9. **PIN gate fallback**: if the screen is still up at `pinGate`, the button becomes a coral 96 pt "Enter PIN" / "Stop the alert" that opens `/pin`; normally `PhaseNavigator` replaces the screen first, as before.
10. **Error copy**: "Cancel didn't go through (…). Nod twice, or tap I'm okay again."

## Contract or shared changes needed

None. Everything came from `src/ui`, `describeTrigger` and the existing `onPhase` data.

For the debug group (their file, not changed here): `app/src/debug/scenarios.ts` scenario 1 still says "Nod, or tap Cancel, while the check-in asks."; the button is now "I'm okay" and the nod copy is "Nod twice", so it could read "Nod twice, or tap I'm okay, while the check-in asks."

## How to test (phone or Simulator)

Run `cd app && npx jest && npx tsc --noEmit && npx expo lint` first (all pass: 54 suites, 655 tests). Then, with the app built and settings saved, compare each step with `docs/design/screens/CheckIn-Whisper.html` and `CheckIn-Loud.html`:

1. Home → **Start session**, then the **Debug panel** → turn **Demo timings** on (10 s stages) → fire scenario 2 (No response, a fall).
   Expected: Check-in opens on its own and can't be swiped away. Top: the three-step bar with **Whisper** lit lavender. Under it the uppercase label **LOOKED LIKE A FALL**. A 240 pt lavender ring counting down from 10 with "seconds" under the number, draining clockwise from 12 o'clock. **Are you okay?**, a blue speaker icon with **Whispering in your AirPods**, then **Nod twice, or tap below.** At the bottom a 96 pt lavender button **I'm okay** / **Cancel the check-in**.
2. Let the whisper stage run out.
   Expected: the bar moves to **Louder** (amber; Whisper dimmed). An amber-iconed card **Looked like a fall** / **Spike 3.1 g, head 70° sideways, still 12 s** replaces the label. The ring refills, now amber, the same size. The line reads **Louder prompt and vibrating** (amber, vibrate icon) and the nod copy adds **After this you'll need your PIN.**
3. Tap **I'm okay** during either stage.
   Expected: the check-in closes and Active session is back (Swift returns to `monitoring`).
4. Start another check-in and nod twice instead.
   Expected: same as step 3.
5. Start another check-in and let both stages run out.
   Expected: the PIN gate opens on its own (as before this redesign).
6. Fire scenario 1 (Safe, a manual trigger).
   Expected: the whisper label reads **CHECK-IN**; on loud the card shows **Check-in** with the reason Swift sent under it.
7. With **Demo timings** off, wait for a scheduled check-in (the interval from Setup).
   Expected: the whisper label reads **SCHEDULED CHECK-IN**; on loud the card shows only **Scheduled check-in** (no repeated detail).
8. VoiceOver on, at a check-in: swipe through.
   Expected: "Step 1 of 3: Whisper", the trigger label, "Time left to answer, progress bar, N seconds left" (one element, updating), "Are you okay?, heading", the stage line, the nod copy, then "I'm okay, button, Cancel the check-in. Tells RaveGuard you're okay, the same as a nod."
9. iPhone SE (3rd gen) Simulator, loud stage.
   Expected: everything fits without scrolling; the ring is a little smaller (196 pt) on both stages, and the button sits fully on screen.
10. Largest Dynamic Type size.
   Expected: the heading and lines grow (capped) and the button stays reachable at the bottom.

## Verification

| Check | Result |
| --- | --- |
| `npx jest` | 54 suites, 655 tests, all pass |
| `npx tsc --noEmit` | exit 0 |
| `npx expo lint` | exit 0 |
