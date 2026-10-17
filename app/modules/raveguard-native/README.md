# raveguard-native

The Expo module between the React Native screens and the Swift session (K2). The API is the seam table in WORK_ORDER.md, typed in `src/RaveGuardNative.types.ts`, plus three additions: `getSnapshot()`, `debugSetOffline(on)` and `setProtectionMode(mode)` (BL1, below). The snapshot also carries `nextCheckInAt` (K8): epoch ms of the next scheduled check-in while monitoring, null otherwise and always null in demo mode; `simulatedOffline` (K11): whether the Debug panel's simulated offline is on, which scenario 4 also turns on and `stopSession()` turns off; and `airPodsConnected` (J12): whether the AirPods' head motion is connected, null until the motion source has said, with changes sent as the `onAirPods` event (`{ connected }`).

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
| Automatic protection | `ios/Hearing/` | Room dB, dose and the level loop (BL1), below |

The runtime runs Justin's real `SessionManager`. On iOS, `withFakes` uses `HeadMotionStream` for real AirPods motion, the phone mic, M5 audio configuration, the selectable Shortcuts noise backend and the [M6 VoicePrompter](ios/Voice/README.md), which requires A2DP output or falls back to haptics. Escalation uses Andy's `ServerClient` when `RG_SERVER_URL` is configured and otherwise uses `FakeEscalationService`; the session log remains in memory. Under `swift test` on a Mac, motion is `FakeMotionSource` with a 10 Hz canned sway; voice tests inject a recording output and play no speech. `debugFire(2)` walks the real ladder (whisper → loud → PIN gate → escalated), and safe/duress voice behavior stays identical. Physical AirPods acceptance checks remain open.

## Automatic protection (BL1)

While a session runs, the runtime takes one room-loudness reading a second and sends `onHearing` (`roomDb`, `dosePercent`, `mode`, then `inEarDb`, the room level minus the AirPods mode's estimated attenuation, and `floorLevel`, the loop's dose-driven floor, null in `manual`). In `auto`, the reading also steps the level loop, whose level goes to the noise controller exactly like the slider's (so `ShortcutsController` still applies its 25 s dwell) and out as `onNoise`. Moving the slider (`setProtectionLevel`) switches to `manual`; `setProtectionMode('auto')` hands control back, easing on from the slider's level. Every session starts in `auto` with zero dose, and Stop clears the readings.

| File | What it does |
| --- | --- |
| `ios/Hearing/HearingConfig.swift` | Every constant in one place, and `LevelMath` (RMS → dB SPL with a calibration offset, HRG-1) |
| `ios/Hearing/DoseTracker.swift` | 85 dB for 8 h, 3 dB exchange rate, on the in-ear level: room dB minus 10 dB in Adaptive or 20 dB in Noise Cancellation, and nothing off while AirPods control is off or not connected. Both attenuations are placeholders, so the dose is an estimate (HRG-2) |
| `ios/Hearing/ProtectionLoop.swift` | Target = room dB over the wearer's loudness target, 30 dB → 100; easing 0.2, at most 10 per second, deadband 2, a floor that rises to 70 at 100% dose and never falls; a step across 70 is always sent (HRG-3) |
| `ios/Hearing/AutoProtection.swift` | One session's dose, loop and mode; the `LevelSource` protocol |
| `ios/Hearing/LevelAccumulator.swift` | Mic buffers into one room-dB reading per second (HRG-1) |
| `ios/Hearing/MicLevelSource.swift` | Real sessions' readings: an `AVAudioEngine` input tap on the phone mic (iOS only) |
| `ios/Module/CannedLevelFeed.swift` | Demo mode's readings: a 74 dB bar ramping to a 108 dB club over a minute |

`MicLevelSource` never configures the audio session. `AudioSessionManager` activates `.playAndRecord`, selects the built-in mic, and allows AirPods A2DP output without enabling Bluetooth HFP. It runs before the session starts and deactivates when monitoring ends. The mic meter asks for permission the first time, restarts on route or engine changes and interruptions, and real sessions show "—" until a valid input route is ready. The calibration offset (`calibrationOffsetDb`, 100 for now) still has to be set on a device against an SPL meter app (C13: within 5 dB at 70 and 95 dB). `swift test` can't run the tap; it covers `LevelAccumulator`; verify actual input and output routing on a physical iPhone and AirPods.

## Adding your Swift

Put files in your own folder under `ios/` (see WORK_ORDER.md). The podspec compiles every `.swift` file under `ios/` except `Tests/`, `Tools/`, `Package.swift` and `.build/`. Wire real implementations in `RaveGuardRuntime.withFakes` (J12), which is the only place that picks fakes.

A new method or event is a `CONTRACT:` change: add it to `src/RaveGuardNative.types.ts`, `index.ts`, `src/mock.ts`, `RaveGuardModule.swift` and the runtime, and get a yes from every owner.

## Tests

```bash
cd app/modules/raveguard-native/ios && swift test   # Swift: session, motion, hearing and module (no Xcode needed)
cd app && npm test                                  # JavaScript wrapper and app config
```
