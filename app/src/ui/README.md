# `src/ui`: the redesign's tokens and components

Everything the redesigned screens share. Screens import from the barrel:

```tsx
import { Card, ListRow, PALETTE, PrimaryButton, Screen, TEXT } from '../ui';
```

Every screen now uses these components; the pre-redesign light components and the LEGACY theme block were removed when the redesign was integrated (`docs/overnight/UI-SUMMARY.md`). Change a component here only with its tests in `__tests__/ui/`, since every screen shares it.

## Rules every component keeps

- **No hex values, font names or sizes in screens.** Use `PALETTE`, `TEXT`, `SPACE`, `RADII`, `TOUCH` from `theme.ts`.
- **Touch targets are at least 44 pt** (`TOUCH.min`). Check-in's buttons are 96 pt (`TOUCH.checkIn`), keypad keys 72 pt (`TOUCH.keypadKey`). Smaller visuals (the 28 pt toggle track) make up the rest with `hitSlop`.
- **VoiceOver:** every control has a role and a label. Icons, dots, avatars and chips are decorative (hidden); the row or button around them carries the words. Groups that read as one thing (a row, a tile, a pill, the ring) are one accessible element.
- **Never write an emergency number.** Copy says "never emergency services". `__tests__/alert/noEmergencyNumbers.test.ts` scans this folder too.
- **Missing readings show `NO_VALUE` ("—")**, and VoiceOver says `NO_VALUE_SPOKEN` ("no reading yet").

## Tokens (`theme.ts`)

| Export | What |
| --- | --- |
| `PALETTE` | Every README token (`bg`, `surface`, `surface2`, `border`, `borderStrong`, `text`, `textMuted`, `textFaint`, `lavender`, `onLavender`, `blue`, `mint`, `amber`, `coral`, `onCoral`, `sosBg`) plus names for the mockups' untokenised colours: `borderEmphasis` `#4A4585` (dashed add / Stop outline), `surfaceSunken` `#1A1836` (callouts, Summary), `lavenderDim` `#6E64A8` (done stage, empty PIN dot), `toggleLocked` `#8A7CC4`, `lavenderPressed` `#E6DDFF`, `onLavenderMuted` `#3A3270` and `onCoralMuted` `#5A2A30` (button second lines), `coralSoft` `#3A2333` (alert pill), `amberSoft` `#2E2A1E` ("Simulated" tag), and the SOS screen's `sosText` `#FFF1F4`, `sosTextMuted` `#D9C3D2`, `sosBorder` `#4A2A3C`, `sosSurface` `#2B1A33` |
| `STAGE_COLORS` | `{ whisper: lavender, loud: amber, pinGate: coral }`: ring, active stage segment and label |
| `STAGE_BAR_COLORS` | `done` (lavenderDim), `inactive` (borderStrong), `inactiveLabel` (textFaint) |
| `RECIPIENT_COLORS`, `recipientColor(index)` | Avatar fill and text by texting order: lavender, blue, then surface2 with lavender text for everyone from the third on |
| `FONTS` | Family names: `soraMedium/SemiBold/Bold`, `manropeRegular/Medium/SemiBold/Bold`, `monoMedium/SemiBold`. Loaded by `fonts.ts` (`useAppFonts`) at startup; the splash stays up until they are |
| `TEXT` | Type scale (set `fontFamily`, never `fontWeight`): `display` 44, `countdown` 64, `titleLarge` 34, `title` 28, `titleSmall` 22, `cardTitle` 17, `metric` 30, `button` 17, `buttonLarge` 20, `buttonHuge` 24, `buttonCaption` 14, `keypadDigit` 28, `body` 15, `bodyStrong` 15, `label` 14, `labelNumeric` 14, `caption` 13, `captionStrong` 13, `small` 12, `smallStrong` 12, `overline` 13 uppercase, `mono` 18, `monoLabel` 11, `error` 13 coral. `countdown`, `metric`, `labelNumeric` and `mono` use tabular numerals |
| `SCREEN_PADDING`, `screenPadding(insets)` | 56 top / 24 sides / 32 bottom, grown to clear the safe area (`Screen` does this for you) |
| `SPACE` | `xxs` 2, `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 22, `xxl` 28 |
| `RADII` | `chip` 10, `iconChip` 12, `iconButton` 14, `field` 16, `row` 18, `button` 20, `card` 22, `buttonLarge` 24, `buttonHuge` 28, `pill` 500 |
| `TOUCH` | `min` 44, `button` 60, `buttonSecondary` 56, `buttonLarge` 72, `checkIn` 96, `keypadKey` 72 |
| `RING` | `{ size: 240, strokeWidth: 12 }`: one ring size for every stage |
| `SOS_CALL` | `{ size: 232, ringWidth: 10, iconSize: 44 }`: SOS's round Call for help button |
| `ICON` | 24 viewBox, 1.8 stroke; sizes 24 / 20 / 18 |
| `HOLD_TO_CONFIRM_MS` | 1000: Stop session's press-and-hold |

## Components

### `Screen`

The frame of every redesigned screen: dark background, safe-area-aware 56 / 24 / 32 padding, light status bar, optional footer pinned to the bottom.

| Prop | Type | Default |
| --- | --- | --- |
| `children` | node | |
| `footer` | node | none |
| `tone` | `'default' \| 'sos'` | `'default'` |
| `scroll` | boolean (false for screens that must fit: Check-in, PIN gate) | `true` |
| `gap` | number between children | 22 |
| `isCentered` | boolean (Cancelling…) | `false` |
| `keyboardShouldPersistTaps`, `contentStyle`, `testID` | | |

```tsx
<Screen footer={<PrimaryButton label="Next: who sees what" onPress={next} />}>
  <StepProgress step={1} />
  <Text accessibilityRole="header" style={TEXT.title}>Who gets the alert?</Text>
</Screen>
```

### `PrimaryButton`

Filled, full width. Label is the accessibility label; `caption` is read as the hint (joined with `accessibilityHint`).

| Prop | Type | Default |
| --- | --- | --- |
| `label`, `onPress` | string, () => void | |
| `tone` | `'lavender' \| 'coral'` | `'lavender'` |
| `size` | `'regular'` 60 pt \| `'large'` 72 pt \| `'huge'` 96 pt | `'regular'` |
| `caption` | second line | none |
| `icon` | `IconName` | none |
| `isDisabled`, `accessibilityLabel`, `accessibilityHint`, `style`, `testID` | | |

```tsx
<PrimaryButton label="I'm okay" caption="Cancel the check-in" size="huge" onPress={RaveGuard.tapCancel} />
<PrimaryButton label="Call for help" caption="Demo: calls a teammate" tone="coral" size="large" icon="phone" onPress={call} />
```

### `SecondaryButton`

Outlined, full width. `tone`: `'default'` (surface + strong border), `'emphasis'` (1.5 pt `borderEmphasis`, Stop session), `'sos'` (transparent on the SOS background). `size`: `'regular'` 56 pt, `'large'` 64 pt. Also `icon`, `iconColor`, `leading` (node before the label), `caption`, `isDisabled`, `accessibilityLabel`, `accessibilityHint`, `style`, `testID`.

```tsx
<SecondaryButton label="I'm okay now" tone="sos" onPress={() => router.push(ROUTES.pin)} />
```

### `HoldToConfirmButton`

Acts only after a press held for `holdMs` (1 s); a fill grows while held and letting go early cancels. VoiceOver's activate (double tap) confirms straight away, and the default hint says so ("Press and hold for 1 second. With VoiceOver, double-tap.").

| Prop | Type | Default |
| --- | --- | --- |
| `label`, `onConfirm` | | |
| `holdMs` | number | `HOLD_TO_CONFIRM_MS` (1000) |
| `caption` | visible second line | "Press and hold" |
| `leading` | node (Stop's coral square) | none |
| `isDisabled`, `accessibilityLabel`, `accessibilityHint`, `testID` | | |

```tsx
<HoldToConfirmButton
  label="Stop session"
  leading={<View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: PALETTE.coral }} />}
  onConfirm={handleStop}
/>
```

Test it with `fireEvent(button, 'pressIn')` + `jest.advanceTimersByTime(1000)`, or `fireEvent(button, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } })`.

### `IconButton`

Square, icon only, at least 44 pt. `icon`, `accessibilityLabel` (required), `onPress`, `variant` (`'outlined'` \| `'ghost'`), `size` (44, or 60 beside a 60 pt Next), `iconColor`, `isDisabled`, `accessibilityHint`, `testID`.

```tsx
<IconButton icon="sliders" accessibilityLabel="Settings" onPress={openSettings} />
<IconButton icon="chevronLeft" accessibilityLabel="Back" size={TOUCH.button} onPress={router.back} />
```

### `TextButton`

A text-only link-style button padded to 44 pt ("Debug panel"). `label`, `onPress`, `accessibilityLabel` (defaults to `label`), `accessibilityHint`, `color` (lavender), `testID`.

```tsx
<TextButton label="Debug panel" onPress={() => router.push(ROUTES.debug)} />
```

### `Card`

Rounded 22 pt panel. `tone`: `'default'` (surface + border), `'sunken'` (`surfaceSunken`, no border: callouts and the phone-side Summary), `'sos'`. `padding`: `'regular'` (18, with `gap`, default 14), `'list'` (tight, for a column of `ListRow`s), `'none'`. Also `style`, `testID`, `accessible` + `accessibilityLabel` to make it one element.

```tsx
<Card padding="list">
  <ListRow icon="clock" title="Check-ins every 30 min" subtitle="Whispered in your ear. Nod to answer." />
  <ListRow icon="people" title="Alert chain" subtitle="Maya → Theo → Venue staff" hasDivider={false} />
</Card>
```

### `ListRow`

One row: a leading chip or avatar, title + optional subtitle, anything trailing, a divider below. One VoiceOver element, labelled "title, subtitle" by default; a button when `onPress` is set.

| Prop | Type |
| --- | --- |
| `title`, `subtitle` | string |
| `icon`, `iconColor` | draws an `IconChip` when `leading` isn't given |
| `leading`, `trailing` | node (`Avatar`, `StatusDot`, a status word, the drag `IconButton`) |
| `hasDivider` | boolean, default true (off for the last row) |
| `onPress` | makes it a button |
| `accessibilityLabel`, `accessibilityHint` | |
| `accessibilityActions`, `onAccessibilityAction` | e.g. Move up / Move down for reordering |

```tsx
<ListRow
  leading={<Avatar index={0} />}
  title="Maya Chen"
  subtitle="+1 403 555 0142 · Contact"
  accessibilityActions={[{ name: 'moveUp', label: 'Move up' }, { name: 'moveDown', label: 'Move down' }]}
  onAccessibilityAction={({ nativeEvent }) => move(nativeEvent.actionName)}
/>
```

### `IconChip`

The 40 pt rounded square with an icon (34 pt for PIN cards and scenario numbers). `icon`, `color` (lavender), `background` (surface2), `size`. Decorative.

### `Toggle`

A switch drawn to the mockup (44 x 28, or `size="large"` 52 x 32), with `hitSlop` to 44 pt. Role `switch`, `accessibilityState.checked`.

| Prop | Type |
| --- | --- |
| `value`, `onValueChange` | boolean, (next) => void |
| `accessibilityLabel` | required ("Maya: see location") |
| `isLocked` | always on, can't change, `toggleLocked` colour, hint "Always on" |
| `isDisabled`, `size`, `accessibilityHint`, `testID` | |

```tsx
<Toggle isLocked value onValueChange={() => {}} accessibilityLabel="Maya: get alerts" />
<Toggle value={p.seeLocation} onValueChange={(v) => set('seeLocation', v)} accessibilityLabel="Theo: see location" />
```

### `Segmented`

Two or three choices as a radio group, 44 pt segments. `options` (`{ value, label, accessibilityLabel? }[]`), `value`, `onChange`, `accent` (`'lavender'` \| `'blue'`), `accessibilityLabel` (the group), `isDisabled`, `testID`.

```tsx
<Segmented
  accent="blue"
  accessibilityLabel="How loud is okay?"
  options={[{ value: 80, label: 'Quieter' }, { value: 85, label: 'Balanced' }, { value: 90, label: 'Louder' }]}
  value={settings.loudnessTarget}
  onChange={setLoudness}
/>
```

### `StepProgress`

Setup's "Step N of 4" with four bars. `step` (1-based), `total` (4). One progress bar ("Setup progress", value "Step 2 of 4").

### `StageBar`

Check-in's three-step ladder (Whisper / Louder / PIN): `stage: CheckInStage | null`. Behind the current stage is `done` (dim), the current one `active` in its stage colour, ahead `inactive`. One element: "Step 2 of 3: Louder". `stageState(stage, current)` and `CHECK_IN_STAGES` are exported.

```tsx
<StageBar stage={phase.stage} />
```

### `CountdownRing`

The check-in ring (react-native-svg) with the seconds in the middle. One progress bar labelled "Time left to answer" whose value text is "N seconds left" ("Waiting for the timer" while `secondsLeft` is null).

| Prop | Type | Default |
| --- | --- | --- |
| `secondsLeft` | number \| null | |
| `fraction` | share of the stage left, 0–1 | |
| `color` | `STAGE_COLORS[stage]` | |
| `size`, `strokeWidth` | | `RING` (240, 12) |
| `accessibilityLabel` | | "Time left to answer" |

```tsx
const countdown = endsAt === null ? null : stageCountdown(endsAt, phaseSeenAt, now); // src/checkIn/countdown.ts
<CountdownRing secondsLeft={countdown?.secondsLeft ?? null} fraction={countdown?.fraction ?? 1} color={STAGE_COLORS[stage]} />
```

### `Ring`

The bare decorative ring under `CountdownRing`: `size`, `strokeWidth`, `fraction`, `color`, `trackColor` (surface2), `testID`. Cancelling… uses `<Ring size={88} strokeWidth={8} fraction={1 / 3} color={PALETTE.lavender} />`. Anything animated on the cancel screens must be identical for both PINs (the duress frame test compares every frame).

### `ProgressBar`

A thin bar, one progress bar for VoiceOver. `fraction` (0–1, or null = empty and "no reading yet"), `accessibilityLabel` (required), `valueText` (default "N percent"), `color` (lavender), `trackColor`, `height` (10; 6 for the PIN gate), `style`.

```tsx
<ProgressBar fraction={hearing.dosePercent === null ? null : hearing.dosePercent / 100} accessibilityLabel="Tonight's dose" />
<ProgressBar fraction={left / total} valueText={`${left} of ${total} seconds left`} accessibilityLabel="Time to enter your PIN" color={PALETTE.coral} height={6} />
```

### `Keypad`

The PIN keypad: 1–9, a bottom-left slot, 0 and delete, 72 pt keys. Each key is a button labelled with its digit; delete is "Delete digit". `onDigit(digit: Digit)`, `onDelete()`, `isDisabled`, `deleteLabel`, and `leftKey?: { label, icon, isEnabled, onPress }` for the bottom-left slot (blank without it): coral with an `onCoral` icon when enabled, a faint icon on no fill, and disabled, otherwise. The PIN gate puts "Submit PIN" there.

```tsx
<Keypad onDigit={(d) => setEntry((e) => (e + d).slice(0, PIN_MAX_LENGTH))} onDelete={() => setEntry((e) => e.slice(0, -1))} />
<Keypad onDigit={onDigit} onDelete={onDelete} leftKey={{ label: 'Submit PIN', icon: 'check', isEnabled: entry.length >= 4, onPress: submit }} />
```

### `PinDots`

How many digits are in, never the digits. `filled`, `total` (4; grows with `filled` since PINs are 4 to 8 digits), `size` (`'large'` 16 pt for the PIN gate, `'small'` 14 pt for Setup), `accessibilityLabel` (default "2 of 4 digits entered").

### `StatusPill`

A rounded status label, one element. `label`, `tone` (`'live'` surface + mint dot, `'alert'` coral on coralSoft, `'warning'` amber on amberSoft, `'neutral'`), `detail` (muted tabular text after the label), `hasDot` (default true except `warning`), `accessibilityLabel`, `testID`.

```tsx
<StatusPill tone="live" label="Session live" detail="1h 42m" />
<StatusPill tone="alert" label="Alert sent · 01:47" />
<StatusPill tone="warning" label="Simulated" />
```

### `StatusDot`

`tone` (`'ok'` mint, `'off'` faint, `'warning'` amber, `'alert'` coral), `size` (10), `testID`. Decorative: always put the status in words next to it.

### `Avatar`

A recipient chip coloured by texting order. `index` (0 = texted first), `variant` (`'number'` rounded square with the position, `'letter'` circle with the initial), `name` (for the letter), `size` (32), `testID`. Decorative. `avatarText(variant, index, name)` is exported.

```tsx
<Avatar index={recipient.order - 1} />
<Avatar index={i} variant="letter" name={status.name} />
```

### `MetricTile`

A small label over a big number, one element. `label`, `value` (formatted string, or `NO_VALUE`; the unit is hidden then), `unit`, `valueColor`, `variant` (`'regular'` Sora, `'mono'` JetBrains Mono for Debug), `accessibilityLabel` (default "Room: 98 dB" / "Room: no reading yet"), `testID`.

```tsx
<MetricTile label="Room" value={formatRoomDb(hearing.roomDb)} unit="dB" />
<MetricTile label="pitch" value="12.4°" variant="mono" />
```

### `InfoCallout`

A note with an optional icon and title. `children` (text or nodes), `title` (uppercase overline in `sunken`, a bold line in `card`), `icon`, `tone` (`'info'` blue, `'warning'` amber, `'alert'` coral, `'sos'`), `variant` (`'sunken'` borderless dark fill, `'card'` surface with a border), `testID`.

```tsx
<InfoCallout icon="phone">If nobody answers, your phone opens a screen with a one-tap call for help. We never dial emergency services on our own.</InfoCallout>
<InfoCallout variant="card" tone="warning" icon="warning" title="Looked like a fall">Spike 3.1 g, head 70° sideways, still 12 s</InfoCallout>
<InfoCallout title="Summary">{summaryText}</InfoCallout>
```

### `TextField`

Label (+ optional `tag`, shown "(optional)"), the 52 pt dark input, then `helper` or `error` (coral border and text). `label`, `value`, `onChangeText`, `tag`, `helper`, `error`, `accessibilityLabel` (default `label`, so tests use `getByLabelText(label)`), `testID`, plus `TextInput` props: `autoCapitalize`, `autoComplete`, `autoCorrect`, `keyboardType`, `maxLength`, `multiline`, `onBlur`, `onSubmitEditing`, `placeholder`, `returnKeyType`, `secureTextEntry`, `textContentType`.

```tsx
<TextField
  label="Meeting spot"
  tag="optional"
  placeholder="e.g. left of the main stage, by the bar"
  helper="Indoor GPS can be off by a block. This goes in the alert."
  maxLength={MAX_MEETING_SPOT_LENGTH}
  value={draft.meetingSpot}
  onChangeText={setMeetingSpot}
/>
```

### `SectionLabel`

A section heading with the `header` role. `children` (string), `variant` (`'overline'` uppercase muted, `'title'` bold 14), `color`, `testID`.

### `Icon` and the icon set (`icons.ts`)

`<Icon name size? color? testID? />`, 24 viewBox, 1.8 stroke, round caps and joins, decorative. Names (`ICON_NAMES`): `shield`, `shieldCheck`, `sliders`, `headphones`, `clock`, `people`, `soundBars`, `grip` (filled drag dots), `plus`, `phone`, `chevronLeft`, `chevronRight`, `terminal`, `check`, `lock`, `info`, `speaker`, `vibrate`, `warning`, `backspace`, `mapPin`, `play`.

```tsx
<Icon name="speaker" size={ICON.sizeTiny} color={PALETTE.blue} />
```

## Session data the screens read

| What | Where in JavaScript |
| --- | --- |
| What started the check-in (scheduled, fall, stillness, manual + reason + time) | `useSessionState().phase.trigger` (`CheckInTrigger \| null`; set during `checkIn`, `escalated` and `sos`, null otherwise). `describeTrigger(trigger)` in `src/session/describe.ts` gives `{ title: 'Looked like a fall', detail: 'Spike 3.1 g, …' }` |
| AirPods connected | `useSessionState().airPodsConnected` (`boolean \| null`; null until Swift reports, which it does once a session starts). Raw: the `onAirPods` event and `getSnapshot().airPodsConnected` |
| Meeting spot | `useSettings().settings.meetingSpot` (string, empty when not set, at most `MAX_MEETING_SPOT_LENGTH` = 120) |
