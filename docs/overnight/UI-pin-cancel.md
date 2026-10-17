# UI redesign: pin-cancel (PIN gate, Cancelling…, Cancelled)

Branch `kean/ui-pin-cancel`, from `kean/ui-foundation` (ae17118). Run unattended; every open choice took the recommended option and is recorded under Decisions.

## Plan

### Restated

Rebuild the `/pin` route to the mockups `PIN-Gate.html`, `Cancelling.html` and `Cancelled.html` with the shared design system (`src/ui`), touching only the files `docs/design/OWNERSHIP.md` gives pin-cancel: `src/screens/PinEntryScreen.tsx`, `src/pin/CancelView.tsx` and new `.tsx` files in `src/pin/`, plus their tests. The PIN logic (`pinStore`, `useCancelSequence`, `cancelSequence`, `pinFeedback`, `pinRules`, …) stays frozen. The duress rule is absolute: one code path for the safe and the duress PIN, `pinResult` never awaited, the same haptic and the same frames, proven by `__tests__/screens/DuressCancelFrames.test.tsx`.

### Mockup elements to build

| Mockup | Element | Built from |
| --- | --- | --- |
| PIN gate | Three-step ladder, PIN stage coral | `StageBar` (`stage` from the phase) |
| | "Enter your PIN / to cancel" (28 pt, centred) | `TEXT.title` |
| | "Your contacts get a text in **0:09**" (coral, tabular) | new `src/pin/PinGateNotice.tsx` |
| | 200 × 6 coral bar, "9 of 15 seconds left" | `ProgressBar` (`height` 6, coral) |
| | Four 16 pt dots, growing to the entry length | `PinDots` (`size` large) |
| | 3 × 4 keypad, 72 pt keys, delete with the backspace icon | new `src/pin/PinKeypad.tsx` (the shared `Keypad` with a Submit key in the bottom-left slot; see Decisions) |
| | Wrong PIN / couldn't check / no PINs lines | kept from the old screen, `TEXT.error` / `TEXT.body` |
| Cancelling | 88 pt ring, 8 pt stroke, a third drawn, lavender; "Cancelling…" 28 pt, centred | `Ring`, `Screen isCentered` |
| Cancelled | 96 pt lavender check badge | `Icon` `check` in a local badge |
| | "Cancelled. / Stay safe." 34 pt | `TEXT.titleLarge` |
| | "Checked in at 01:46" | `TEXT.body`, the time the cancel started |
| | "Back to my session" | `PrimaryButton` |

### Data sources

- Phase and stage: `useSessionState().phase` and `phaseSeenAt` (`src/session/SessionStateProvider.tsx`).
- Countdown: `stageCountdown(stageEndsAt, phaseSeenAt, now)` (`src/checkIn/countdown.ts`) with `useNow` (`src/session/useNow.ts`). Shown only while the phase is `checkIn` at stage `pinGate` with a `stageEndsAt`; from Alert or SOS (phase `escalated`/`sos`) the line is neutral copy instead.
- PIN check: `usePins().store.verify()` and `hasPins` (`src/pin/PinStoreProvider.tsx`); `sendPinResult('wrong')` (`src/pin/pinFeedback.ts`); `useCancelSequence()` (`src/pin/useCancelSequence.ts`) for safe and duress.
- Lengths: `PIN_MIN_LENGTH` / `PIN_MAX_LENGTH` (`src/pin/pinRules.ts`, 4 to 8).
- Exit: `router.dismissTo(ROUTES.session)` (`src/navigation/phaseNavigation.ts`).

### Risks

| Risk | Mitigation |
| --- | --- |
| Auto-submit on the 4th digit breaks 5 to 8 digit PINs (the store keeps only hashes, so the screen can't know the length) | No auto-submit; a Submit key in the keypad's empty slot, enabled from 4 digits (Decision 1) |
| "Checked in at HH:MM" reads the clock, so two recordings a minute apart would differ | The time is taken when the cancel starts, the same way for both PINs; the frame tests pin the fake clock to the same instant at the start of each recording (stronger, not weaker: the time is now part of the compared frames) |
| A countdown timer on the cancel screens would add frames that depend on when the PIN was typed | The countdown lives in `PinGateNotice`, mounted only on the entry step and only with a `stageEndsAt`; the cancel screens have no timers or animation |
| Any animation on Cancelling… could differ between runs | The ring is static (a third drawn), as in the mockup |
| Heading line breaks ("Cancelled.⏎Stay safe.") change the text the tests look for | The header's accessibility label keeps the one-line copy, so VoiceOver and the frame test's `"Cancelled. Stay safe."` still match |
| Small phones (667 pt) can't fit the gate plus a 324 pt keypad | `Screen` scrolls (it only does when it must) |

## What was built

| File | What |
| --- | --- |
| `app/src/screens/PinEntryScreen.tsx` | The PIN gate on the new design system: `StageBar` (check-in only), "Enter your PIN / to cancel", the notice line, `PinDots`, the keypad pinned to the bottom, wrong-PIN / couldn't-check / no-PINs lines, and Back when opened from Alert or SOS. The submit logic (one `startCancel` for safe and duress, `sendPinResult('wrong')`, the double-submit guard, Keychain failure = no strike) is unchanged line for line |
| `app/src/pin/PinKeypad.tsx` (new) | The 3 x 4 keypad, 72 pt keys, with "Submit PIN" in the bottom-left slot (coral with a check from 4 digits, a faint check before), "Delete digit" bottom-right |
| `app/src/pin/PinGateNotice.tsx` (new) | `pinGateNotice()` (pure), `formatCountdown()`, `PinGateNotice` and `LivePinGateNotice`: "Your contacts get a text in m:ss" with the 200 x 6 coral `ProgressBar`, or neutral copy. The 250 ms timer runs only while the PIN stage has a `stageEndsAt` |
| `app/src/pin/CancelView.tsx` | Cancelling… (static 88 / 8 ring, a third drawn, centred heading, polite live region) and Cancelled (96 pt lavender check badge, "Cancelled. / Stay safe." 34 pt, "Checked in at HH:MM", "Back to my session"); `formatCheckedInTime()` |
| `app/__tests__/screens/PinEntryScreen.test.tsx` | Keypad entry; every old behaviour still asserted; new: ladder, heading, dots grow and shrink, 8-digit cap, Submit off under 4 digits (no strike), 6-digit PIN with no auto-submit, countdown and bar, Alert / SOS neutral copy, Back from Alert, no Back during the check-in, "Checked in at" |
| `app/__tests__/screens/DuressCancelFrames.test.tsx` | Selectors only: keypad presses + "Submit PIN" instead of the text field + "Submit". Each recording now starts at the same fake-clock instant (`jest.setSystemTime`) so the new clock-derived line is part of the compared frames; one added assertion that "Checked in at 01:46" appears on the same frame as "Cancelled. Stay safe." for both PINs. Every frame, haptic, `pinResult` and pathname assertion is untouched |
| `app/__tests__/pin/CancelView.test.tsx` | Both steps, the ring, the badge, the time kept across the step change, "Back to my session" |
| `app/__tests__/pin/PinKeypad.test.tsx`, `app/__tests__/pin/PinGateNotice.test.tsx` (new) | Keys, labels, disabled states, 72 pt keys; notice for every phase, m:ss, bar value text, no diagnosis or emergency words |

The duress frame test was mutation-checked: making only the duress PIN wait 20 ms before `startCancel` fails four of its eight tests; restored afterwards.

## Decisions (recommended options, taken unattended)

1. **No auto-submit; a Submit key.** PINs are 4 to 8 digits (`pinRules.ts`) and the store keeps only salted hashes, so the screen can't know the configured length. Auto-submitting on the 4th digit would lock out 5 to 8 digit PINs, and silently checking at each length would cost Keychain reads per key press. "Submit PIN" sits in the keypad's empty bottom-left slot and turns on at 4 digits, so a short entry is never sent as a strike. The same press submits both PINs, so nothing differs between them.
2. **A local keypad** (`src/pin/PinKeypad.tsx`) instead of `ui/Keypad`, which has no slot for Submit and is frozen. Same grid, sizes and tokens. See shared changes.
3. **Neutral copy from Alert or SOS**: "Your contacts have been texted. Your PIN tells them you're okay." No countdown and no stage ladder there (there's no stage). During the check-in but without a PIN-stage end (no `stageEndsAt`, or the gate opened from Check-in's "Enter PIN" during Whisper or Louder, whose end isn't when the texts go): "Enter it before your contacts get a text." No phase open: no line.
4. **Back only when opened from Alert or SOS** (phase `escalated`/`sos` and the stack can go back). During the check-in there is no Back: the session decides when the gate closes.
5. **"Checked in at HH:MM"** is the local 24-hour time when "Cancelling…" first appeared, captured by `CancelView` on mount and kept through the step change. Both PINs reach it the same way.
6. **No animation** on Cancelling… or Cancelled: the ring is static, as drawn in the mockup. That is deterministic by construction.
7. **Line breaks** in "Enter your PIN / to cancel" and "Cancelled. / Stay safe." are drawn as in the mockups; the headers' accessibility labels keep the one-line copy, so VoiceOver reads it naturally and the cross-test anchor `"Cancelled. Stay safe."` is unchanged.
8. **Check stroke 1.8** on the badge (the mockup drew 2.2), following the foundation's one-stroke rule.
9. **"Back to my session"** is a regular `PrimaryButton` (60 pt; the mockup drew 64) and keeps `router.dismissTo(ROUTES.session)`.
10. **The gate scrolls** only when it must (small phones, large Dynamic Type); on a 390 x 844 phone it fits.
11. **No haptic on key presses** and none on a wrong PIN, as before: the one haptic in this flow is the cancel's.

## Contract or shared changes needed

None are required; the screen works with the frozen files as they are. Suggested follow-ups for the integration step:

- `app/src/ui/Keypad.tsx`: an optional `leftKey?: { label: string; icon: IconName; isEnabled: boolean; onPress: () => void }` (drawn coral with `onCoral` icon when enabled, faint on no fill otherwise) in the empty bottom-left slot. Then `src/pin/PinKeypad.tsx` can be deleted and the gate can use `ui/Keypad`.
- `app/src/app/_layout.tsx`: consider `gestureEnabled: false` on the `pin` screen while a check-in is open. Today an edge swipe on the gate goes back to Check-in (unchanged from before the redesign, and the same for both PINs, so not a duress issue).

## How to test on the phone or Simulator

Set up with the safe PIN 2468 and the duress PIN 1357 (or your own). Start a session. Compare each step with `docs/design/screens/PIN-Gate.html`, `Cancelling.html`, `Cancelled.html`.

| # | Do | Expect |
| --- | --- | --- |
| 1 | Debug, scenario 2 (fall); don't answer Whisper or Louder | The PIN gate opens: ladder with Whisper and Louder dimmed and **PIN** coral; "Enter your PIN / to cancel"; "Your contacts get a text in 0:NN" (the number coral) counting down each second; the 200 pt coral bar draining; four empty dots; the keypad at the bottom with an empty-looking check bottom-left and backspace bottom-right. No Back button |
| 2 | Tap 1, 2 | Two dots fill. Submit is still off |
| 3 | Tap Delete | One dot left |
| 4 | Tap 2, 3, 4 (now "1234"), then the check key (now coral) | "Wrong PIN. Try again." in coral; dots empty; the countdown keeps running; no haptic |
| 5 | Tap 2, 4, 6, 8 and Submit | Success haptic, "Cancelling…" with a small lavender ring, centred, for about 0.6 s; then the lavender check badge, "Cancelled. / Stay safe.", "Checked in at HH:MM" (now) and "Back to my session" |
| 6 | Wait 10 s | The screen stays on Cancelled (it leaves on a tap only) |
| 7 | Tap "Back to my session" | Active session |
| 8 | Repeat 1 to 7 with the duress PIN 1357, screen-recording both runs | Every frame, the timing and the haptic match the safe run. The app stays on Cancelled, then Active session. Contact 1 gets the duress alert (on their phone, not the wearer's) |
| 9 | Repeat 1, then type three wrong PINs | The third escalates: the app opens Alert |
| 10 | On Alert, tap "I'm okay now" | The PIN gate without the ladder or countdown: "Your contacts have been texted. Your PIN tells them you're okay." and a Back button top-left |
| 11 | Tap Back | Alert again; nothing was sent |
| 12 | "I'm okay now" again, enter the safe PIN | Cancelling…, then Cancelled, as in step 5 |
| 13 | With a 6-digit PIN set in Setup, run 1 and type the 6 digits, Submit | Nothing happens at the 4th digit; Submit cancels after the 6th. Typing a 9th digit does nothing (8 max) |
| 14 | VoiceOver on, at the gate | Reads "Step 3 of 3: PIN", "Enter your PIN to cancel", "Your contacts get a text in 0:NN", "Time to enter your PIN, N of M seconds left", "2 of 4 digits entered"; keys read "1"…"0", "Delete digit", "Submit PIN" (dimmed until 4 digits) |
| 15 | Settings, Accessibility, Larger Text at max, back to the gate | Everything readable; the screen scrolls rather than clipping the keypad |

## Verification

| Check | Result |
| --- | --- |
| `npx jest` | 56 suites, 671 tests, all pass |
| `npx tsc --noEmit` | exit 0 |
| `npx expo lint` | exit 0 |
