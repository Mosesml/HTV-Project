# RaveGuard screen designs: implementation brief

Each file in `screens/` is a reference mockup for one screen, built in HTML with every style inline. Open any of them in a browser to see the screen. The exact colours, sizes, radii and copy are in the markup.

**Do not ship this HTML.** The wearer app is Expo React Native with TypeScript (see `WORK_ORDER.md`). Rebuild each screen as a React Native screen in `app/src/screens/`, matching the mockup. The contact pages are the exception: they really are web pages, served by the server (see the table below).

## Design tokens

Put these in one file (`app/src/theme.ts`) and don't hard-code hex values in screens.

### Wearer app (dark)

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#151619` | Screen background |
| `surface` | `#1F2125` | Cards, keypad keys, secondary buttons |
| `surface2` | `#292C31` | Tiles inside cards, icon chips |
| `border` | `#30343A` | Card borders, dividers |
| `borderStrong` | `#41464E` | Inputs, off toggles, unfilled progress |
| `text` | `#F2F3F5` | Primary text |
| `textMuted` | `#B6BBC3` | Secondary text |
| `textFaint` | `#969DA8` | Inactive labels, drag handles |
| `lavender` | `#C9B8FF` | Primary buttons, active states, whisper ring |
| `onLavender` | `#1A1638` | Text on lavender, blue or mint fills |
| `blue` | `#A4CCFF` | Second accent: hearing, contact 2, info |
| `mint` | `#A6EBCF` | Connected, acknowledged, "different PINs" check |
| `amber` | `#FFC79A` | Louder prompt stage, "no reply", "Simulated" tag |
| `coral` | `#FFB0A3` | PIN stage, alert, SOS, call buttons |
| `onCoral` | `#2A1218` | Text on coral |
| `sosBg` | `#1E1226` | SOS screen background only |

### Contact web pages (light)

| Token | Value |
| --- | --- |
| `bg` | `#F4F1FF` |
| `surface` | `#FFFFFF` |
| `border` | `#DDD6F7` |
| `divider` | `#EEEAFB` |
| `text` | `#1C1838` |
| `textMuted` | `#5A5480` |
| `primary` | `#5B45C2` (white text) |
| `primarySoft` | `#E6DEFF` (text `#2E2370`) |
| `alertPillBg` / `alertPillText` | `#FFE2DC` / `#8F2A1E` |
| `mapPlaceholder` | `#DCEBFF` |
| `duressBanner` | `#2E2370` (white text, amber `#FFC79A` label) |

### Type

- **Sora** (500, 600, 700): headings, big numbers, button labels.
- **Manrope** (400–700): body text, captions, small labels.
- **JetBrains Mono** (500, 600): Debug readouts only.
- Load them with `@expo-google-fonts/sora`, `@expo-google-fonts/manrope` and `@expo-google-fonts/jetbrains-mono`.
- Use tabular numerals (`fontVariant: ['tabular-nums']`) for timers and dB.
- Heading sizes: 28–34 with letter-spacing -0.02em. Body text: 15. Captions: 12–13.

### Shape and spacing

- Screen padding: 56 top, 24 sides, 32 bottom. Respect the safe area; the mockups don't draw a status bar.
- Radii: cards 20–22, buttons 20–28, small chips 10–12, pills 999.
- Touch targets: at least 44 pt everywhere. Cancel and "I'm okay" on Check-in are 96 pt tall, and keypad keys are 72 pt (the PRD asks for at least 60).

## Screens

The current screen follows `onPhase`. React Native doesn't hold any session logic.

| Mockup | RN screen | Shown when | Data from the native module |
| --- | --- | --- | --- |
| `Setup-Contacts.html` | `SetupContacts` | First launch, or the settings button on Home | Local settings (K4) |
| `Setup-Permissions.html` | `SetupPermissions` | Setup step 2 | Local settings; the 4 toggles per recipient match `PermissionSet` |
| `Setup-Session.html` | `SetupSession` | Setup step 3 | Local settings; the result goes to `configure()` |
| `Setup-PINs.html` | `SetupPins` | Setup step 4 | `expo-secure-store` salted hashes (K6); the PINs must differ |
| `Home.html` | `Home` | phase `idle` | Button calls `startSession()` |
| `Active.html` | `ActiveSession` | phase `monitoring` | `onMotion`, `onNoise`, `onHearing`; the slider calls `setProtectionLevel()` |
| `CheckIn-Whisper.html` | `CheckIn` (stage `whisper`) | phase `checkIn`, stage `whisper` | Ring counts down to `stageEndsAt`; button calls `tapCancel()` |
| `CheckIn-Loud.html` | `CheckIn` (stage `loud`) | phase `checkIn`, stage `loud` | Same screen as whisper, amber accent, shows the trigger reason |
| `PIN-Gate.html` | `PinGate` | phase `checkIn`, stage `pinGate` | Calls `pinResult(kind)` |
| `Cancelling.html` | `CancelConfirm` (step 1) | Right after a safe **or** duress PIN | Fixed 600 ms |
| `Cancelled.html` | `CancelConfirm` (step 2) | After the 600 ms | Then back to `ActiveSession` |
| `Alert.html` | `Alert` | phase `escalated` | `onEscalation` (recipients, notifiedAt, ackedAt) |
| `SOS.html` | `Sos` | phase `sos` | The call button dials `teammatePhone` from config |
| `Debug.html` | `Debug` | Link on Home and Active | `debugFire(1–7)`, `setNoiseBackend()`, live `onMotion` |
| `Contact-Full.html` | **Server page**, `server/public/` | Contact with full permissions | `GET /a/:token/data` |
| `Contact-Reduced.html` | **Server page** | Contact without location or full brief | Same endpoint, filtered |
| `Contact-Duress.html` | **Server page** | Duress-flagged alert | No call button, neutral page title |
| `Venue-Staff.html` | **Server page**, wide layout | Venue staff link (P1, B13/BL5) | Same endpoint, staff view |

The four contact pages go to Andy's `server/public/` as static HTML and vanilla JS. For those, the mockup HTML is a valid starting point: swap the sample text for data from `/a/:token/data` and poll every 3 s.

## Rules the screens must keep

1. **Both PINs look identical.** Safe and duress follow one code path: a fixed 600 ms "Cancelling…", the same haptic, then "Cancelled. Stay safe." Call `pinResult` without waiting on its result. After a duress PIN, the app keeps showing `ActiveSession`, because Swift keeps emitting `monitoring`.
2. **Never claim a diagnosis.** The copy says "may need help", "missed a check-in" and "looked like a fall", never "drugged" or "unconscious". Keep it that way.
3. **Hearing values can be null.** `onHearing` sends nulls until BL1 lands. Show "—" for room dB, in-ear dB and dose, and keep the slider working.
4. **No emergency number anywhere.** The SOS and Alert call buttons dial the teammate number from config, and the label says so in demo mode.
5. **One Check-in screen.** The whisper and loud stages are the same component with a different accent, label and ring colour. The three-step bar at the top shows the stage.

## Components to extract

`Screen`, `PrimaryButton`, `SecondaryButton`, `Card`, `ListRow`, `Toggle`, `Segmented`, `StepProgress` (setup, 4 steps), `StageBar` (check-in, 3 steps), `CountdownRing` (`react-native-svg`), `Keypad`, `StatusPill`, `Avatar` (numbered or lettered chip), and the stroke icons. All icons are 24×24 viewBox, 1.8 stroke and round caps; each mockup has their SVG paths.

Suggested libraries: `react-native-svg`, `expo-haptics`, `expo-secure-store`, `@react-native-community/slider`, `@react-navigation/native-stack`.

## Sample data

Alex, Maya Chen, Theo Park, "Main stage medical", the +1 555 phone numbers, the times and the dB values are placeholders. Wire them to real settings and events.

## Still open

These are being decided; build the mockup version until told otherwise:

- Dark setup flow, or light?
- Venue staff as the third recipient (shown) or not?
- Optional "Meeting spot" field (shown)?
- After "Cancelled", go back to the session automatically, or on tap (shown)? It must behave the same for both PINs either way.
- Press-and-hold to stop the session?
- Can the wearer resolve from Alert via the PIN (shown: "I'm okay now" leads to PinGate)?
- Duress page shows no RaveGuard branding (shown: "Private message")?
- App name.
