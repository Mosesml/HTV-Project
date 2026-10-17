# RaveGuard app

The Expo React Native app (Expo SDK 57, React Native 0.86, Expo Router, TypeScript). It runs as a **dev build** on your own iPhone. Expo Go won't work, because it can't load our native module.

## One-time setup

1. **Xcode 26.x.** We're on SDK 57 so that Macs still on macOS 15 (Sequoia) can build. Xcode 27 needs macOS 26 (Tahoe).
   - **macOS 15:** the App Store offers Xcode 27, which won't install. Download the newest Xcode 26.x from [developer.apple.com/download/all](https://developer.apple.com/download/all), unzip the `.xip` and drag Xcode into Applications.
   - **macOS 26:** Xcode 27 from the App Store should work too.

   Open Xcode once to accept the license and install the iOS platform, then point the command-line tools at it:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   xcodebuild -version   # post this in the team chat; we should all match
   ```
2. **CocoaPods.** `brew install cocoapods`
3. **Apple ID.** In Xcode → Settings → Accounts, sign in with your Apple ID. A free "Personal Team" is enough.
4. **iPhone.** Plug it in, tap Trust, then turn on Settings → Privacy & Security → Developer Mode (the phone restarts).
5. **Your local settings.** From the repo root:
   ```bash
   cd app
   cp .env.example .env.local   # then set RG_BUNDLE_SUFFIX to your name, e.g. moses
   npm install
   ```
   Your build gets its own bundle ID, `com.raveguard.<suffix>`, so the four free teams never clash. `RG_APPLE_TEAM_ID` is optional. Leave it empty and Expo picks your team from the keychain.

## Run it on your phone

```bash
cd app
npm run ios:device    # = npx expo run:ios --device; pick your iPhone from the list
```

The first build takes a few minutes. After that, `npm start` serves JavaScript changes to the installed app. You only need to rebuild with `npm run ios:device` when native code or `app.json` changes.

## Checks

```bash
npm test            # app config, native module wrapper, phase navigation, settings, setup flow, PIN rules, PIN gate and one test per screen
npm run typecheck
npm run lint
```

## Screens

Routes live in `src/app/` and stay thin; each re-exports a screen from `src/screens/`. `src/app/_layout.tsx` wraps one stack in `SessionStateProvider` (the native session's phase and escalation) and `PhaseNavigator`, which opens Check-in, PIN entry and Alert when the phase calls for them (rules and tests in `src/navigation/phaseNavigation.ts`).

| Route | Screen | Reached by |
| --- | --- | --- |
| `/` | Setup | App launch |
| `/session` | Active session | Start session on Setup |
| `/check-in` | Check-in | A check-in starting (`onPhase` `checkIn`) |
| `/pin` | PIN entry | The PIN gate stage, or Enter PIN on Alert |
| `/alert` | Alert | `escalated` or `sos` |
| `/debug` | Debug | The Debug button on Setup and Active session |

Screen tests render the real route tree with `renderApp()` from `test-utils/renderApp.tsx`; `jest.setup.ts` swaps the Swift module for `modules/raveguard-native/src/mock.ts` in every test, `expo-file-system` for the in-memory `test-utils/fakeFileSystem.ts`, `expo-secure-store` for the in-memory Keychain in `test-utils/fakeSecureStore.ts` (reach it with `fakeSecureStore()`), and `expo-crypto` for Node's random bytes, UUIDs and SHA-256 (`test-utils/fakeCrypto.ts`).

## Settings

`src/settings/` stores the wearer's settings (K4): the module's `Settings` type, saved as JSON in `raveguard-settings.json` in the app's document directory (`expo-file-system`). PINs are not stored here (K6 keeps salted hashes in `expo-secure-store`).

| File | What it does |
| --- | --- |
| `SettingsProvider.tsx` | Loads the file once at launch; `useSettings()` gives `settings`, `isLoaded`, `problem`, `save(next)` and `reset()` |
| `settingsStore.ts` | `loadSettings` (never throws: a missing or damaged file gives the defaults plus a `problem`), `saveSettings`, `applySettings` (validate, save, then `configure()`) |
| `validateSettings.ts` | The same rules Swift's `ModuleSettings` applies, plus length limits and recipients kept in texting order; returns every issue with its path |
| `recipients.ts` | Add, update, remove, move and set permissions, returning new settings with `order` renumbered; ids from `expo-crypto`'s `randomUUID()` |
| `settingsStorage.ts` | The file (written to a temp file, then moved into place) and an in-memory storage for tests |

Settings reach Swift through `configure()` when they are saved and right before Start session, never just because the app launched: `configure()` during a running session reschedules the next check-in.

## Setup flow and PINs

Setup (`src/screens/SetupScreen.tsx`, K5) opens a one-page form when nothing is saved: your name, Contact 1, Contact 2 and venue staff with four permission switches each, the check-in interval, the loudness target, a self-description and both PINs. Once saved it shows a summary with Start session and Edit setup (off while a session runs).

| File | What it does |
| --- | --- |
| `src/setup/setupDraft.ts` | The form's state and `checkSetup`, which builds the settings and PINs or gives one message per field |
| `src/setup/setupRows.ts` | Recipient rows (add, move up, remove, permissions) and the starter permissions: Contact 1 sees everything, Contact 2 gets the defaults, venue staff see location |
| `src/setup/SetupForm.tsx`, `RecipientCard.tsx`, `PinFields.tsx`, `SetupSummary.tsx` | The form and its parts |
| `src/pin/pinRules.ts` | 4 to 8 digits each, and the two PINs must differ |
| `src/pin/pinStore.ts` | The `PinStore` interface (`hasPins`, `setPins`, `verify`, `clearPins`) and an in-memory stand-in for tests |
| `src/pin/securePinStore.ts` | The app's store (K6): both PINs as salted SHA-256 hashes in one `expo-secure-store` Keychain item (`raveguard.pins`, this device only); `verify` returns `safe`, `duress` or `wrong` |
| `src/pin/pinHash.ts` | 16-byte random salts, SHA-256 of `salt:pin` with `expo-crypto`, and a constant-time compare |
| `src/pin/PinStoreProvider.tsx` | `usePins()`; `appPinStore()` is the store the app uses (the secure one) |

## PIN gate

The PIN entry screen (`src/screens/PinEntryScreen.tsx`, K6) checks the entry with `usePins().store.verify(entry)` and sends the result to Swift with `pinResult`. Safe and duress share one code path to "Cancelled. Stay safe." and `pinResult` is not awaited (the duress rule). Every wrong entry is sent as `wrong`; Swift counts them and fires the escalation on the third. If the Keychain can't be read, the screen says "Couldn't check your PIN. Try again." and sends nothing, so it isn't a strike. Plain PINs are never stored, and `verify` hashes every entry under both salts so safe, duress and wrong take the same work.

iOS keeps Keychain items after the app is deleted, so a reinstall still has the old PINs (Setup says "Leave both PINs blank to keep the ones you set."). Debug → Reset settings clears them.

## Rules

- `ios/` and `android/` are generated by `expo prebuild` and git-ignored. Never edit them. Native settings go in `app.json`, and our Swift goes in `modules/raveguard-native/ios/` (see WORK_ORDER.md for which folders are yours).
- Add packages with `npx expo install <pkg>`, not `npm install <pkg>`, so versions match SDK 57.
- Don't add `expo-av` or `expo-audio`. They configure the audio session themselves, which would undo Moses's audio setup (M5).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Untrusted Developer" when opening the app | Settings → General → VPN & Device Management → your Apple ID → Trust |
| App stops opening after 7 days | Free-team profiles expire weekly. Run `npm run ios:device` again |
| "Maximum number of apps" error | Free teams can sideload 3 apps per device. Delete an old sideloaded app |
| `RG_BUNDLE_SUFFIX must be set…` | You skipped step 5 above |
| Signing error mentioning a bundle ID that's taken | Another team already used that suffix. Pick a different `RG_BUNDLE_SUFFIX` |
