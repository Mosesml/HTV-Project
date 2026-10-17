# raveguard-native

The Expo module between the React Native screens and the Swift session (K2). The API is the seam table in WORK_ORDER.md, typed in `src/RaveGuardNative.types.ts`, plus two additions: `getSnapshot()` and `debugSetOffline(on)`. The snapshot also carries `nextCheckInAt` (K8): epoch ms of the next scheduled check-in while monitoring, null otherwise and always null in demo mode; and `simulatedOffline` (K11): whether the Debug panel's simulated offline is on, which scenario 4 also turns on and `stopSession()` turns off.

## UI redesign additions (approved by the team)

Each was added at the end of its list, in the types, `index.ts` (types only), `src/mock.ts`, `RaveGuardModule.swift` (the event list comes from `RaveGuardRuntime.Event`) and the runtime, with tests on both sides. `SessionManager` is unchanged.

| Change | JavaScript | Swift behind it |
| --- | --- | --- |
| `onPhase` gains `trigger: { kind, reason, at } \| null` (`CheckInTrigger`; kind is `scheduled`, `fall`, `stillness` or `manual`) | Set while `checkIn`, `escalated` and `sos`; null while `idle` and `monitoring`, so a duress PIN still looks like a safe one. Also in `getSnapshot().phase` | `Module/TriggerTrackingLog.swift` wraps the session log: it reads the `.trigger` entry ("kind: reason") and promotes it when `.checkInStarted` follows; the runtime adds it to Justin's phase payload |
| New event `onAirPods: { connected }`, snapshot field `airPodsConnected: boolean \| null` | null until the motion source reports, which it does once a session starts | The runtime reads its own stream of the motion source's `airPodsConnected` (MotionBroadcast gives each reader its own) and emits on change |
| `Settings.meetingSpot: string` | Empty when not set, at most 120 characters (`MAX_MEETING_SPOT_LENGTH`); a saved file without it reads as empty | `ModuleSettings.meetingSpot`, optional (missing or null reads as empty), kept for the brief |

## How it fits together

| Layer | File | What it does |
| --- | --- | --- |
| JavaScript API | `index.ts` | What screens import. Rejects bad arguments before they reach Swift |
| Native binding | `src/RaveGuardNativeModule.ts` | `requireNativeModule('RaveGuardNative')` |
| Jest stand-in | `src/mock.ts` | Records calls and emits any event, for screen tests (usage in its header). Like Swift, `setProtectionLevel` and `setNoiseBackend` answer with `onNoise`, and `debugSetOffline` updates the snapshot |
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
