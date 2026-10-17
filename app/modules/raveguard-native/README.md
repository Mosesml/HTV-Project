# raveguard-native

The Expo module between the React Native screens and the Swift session (K2). The API is the seam table in WORK_ORDER.md, typed in `src/RaveGuardNative.types.ts`, plus two additions: `getSnapshot()` and `debugSetOffline(on)`.

## How it fits together

| Layer | File | What it does |
| --- | --- | --- |
| JavaScript API | `index.ts` | What screens import. Rejects bad arguments before they reach Swift |
| Native binding | `src/RaveGuardNativeModule.ts` | `requireNativeModule('RaveGuardNative')` |
| Jest stand-in | `src/mock.ts` | Records calls and emits any event, for screen tests (usage in its header) |
| Expo glue | `ios/RaveGuardModule.swift` | Thin: each function runs on the main queue and calls the runtime |
| Runtime | `ios/Module/RaveGuardRuntime.swift` | Owns `SessionManager` and turns its outputs into events |
| Settings, payloads | `ios/Module/` | Checks `configure()` input; encodes `onEscalation`, `onNoise`, `onHearing` |

Today the runtime runs Justin's real `SessionManager` on fakes: Andy's `FakeEscalationService`, Justin's `FakeMotionSource`, an in-memory log, a fake noise controller and a 10 Hz canned motion feed. So `debugFire(2)` walks the real ladder (whisper → loud → PIN gate → escalated), and the duress rule behaves as it will in the real app.

## Adding your Swift

Put files in your own folder under `ios/` (see WORK_ORDER.md). The podspec compiles every `.swift` file under `ios/` except `Tests/`, `Tools/`, `Package.swift` and `.build/`. Wire real implementations in `RaveGuardRuntime.withFakes` (J12), which is the only place that picks fakes.

A new method or event is a `CONTRACT:` change: add it to `src/RaveGuardNative.types.ts`, `index.ts`, `src/mock.ts`, `RaveGuardModule.swift` and the runtime, and get a yes from every owner.

## Tests

```bash
cd app/modules/raveguard-native/ios && swift test   # Swift: session, motion and module (no Xcode needed)
cd app && npm test                                  # JavaScript wrapper and app config
```
