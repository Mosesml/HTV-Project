# Motion and session core (Justin)

Head motion from the AirPods turns into fall triggers, nods and a coarse motion state; `SessionManager` runs the check-in ladder on top. Everything here is plain Swift with injected clocks and fakes, so it builds and tests on a Mac:

```sh
cd app/modules/raveguard-native/ios
swift test                                  # all motion + session tests
swift run motion-probe replay Motion/Fixtures   # detections per class + J6/J7 verdicts
Tools/MotionProbe/run.sh                    # J1: live AirPods pitch/roll/yaw on a Mac
```

`swift test` uses Swift Testing, which works with the Command Line Tools; XCTest needs full Xcode. The same tests run under Xcode unchanged.

## Files

| File | What it does |
| --- | --- |
| `HeadMotionStream.swift` | `MotionEventSource` over CMHeadphoneMotionManager; restarts on reconnect and on errors; publishes samples, 10 Hz readouts, triggers, nods |
| `FakeMotionSource.swift` | Fires triggers and nods on demand, for tests and the Debug panel |
| `MotionPipeline.swift` | Samples → fall triggers, nods, state, readouts; shared by live and replay |
| `FallDetector.swift` | Spike ≥ 2.5 g, head ≥ 50° from upright within 3 s, still for 10 s |
| `NodDetector.swift` | ≥ 2 pitch reversals of ≥ 12° within 2 s, mostly pitch, body fairly still |
| `MotionCSV.swift`, `MotionRecorder.swift` | Fixture format and the J4 recorder |
| `MotionReplay.swift` | J5 harness: replays a folder of takes and scores the J6/J7 bars |
| `../Session/SessionManager*.swift` | Check-in state machine, timings, clock |

## Recording fixtures (J4)

One take per file in `Motion/Fixtures/`, named `<person>_<label>_<take>.csv`, with label one of `dancing`, `walking`, `sitdown`, `fall`, `nod`. Start every take standing (or sitting) upright for at least 2 s: the first second sets the upright baseline.

| Label | Per person | Take length |
| --- | --- | --- |
| `dancing` | 5 min, with jumps | one take |
| `walking` | 3 min, walking and standing | one take |
| `sitdown` | 10 | ~10 s each |
| `fall` | 10, onto a mattress, then lie still 15 s | ~20 s each |
| `nod` | 10, music loud | ~6 s each |

From the phone: the Recorder screen (React Native) calls the module's recorder and AirDrops the CSV. From a Mac with the AirPods: `Tools/MotionProbe/run.sh record fall justin 20`.

## Tuning (J6, J7)

Run `swift test` or `motion-probe replay`; the replay test fails with the bar it missed. Thresholds live in `FallDetectorConfig` and `NodDetectorConfig`. The current values are the PRD's starting points, and the detectors pass on synthetic clips only. Nothing is proven on real people until the fixtures are in.

## Integration notes for the module (J12, with Kean)

- The podspec must exclude this package's dev files: `s.exclude_files = ["Tests/**", "Tools/**", "Package.swift"]`.
- `SessionManager(config:clock:escalation:log:prompter:motion:)` with `SystemSessionClock()`, Andy's `ServerClient` (or `FakeEscalationService`), Andy's `SessionLog`, Moses's `VoicePrompter` (conforms to `SessionPrompter`), and `HeadMotionStream()`.
- Module methods map one to one: `configure`, `start`, `stop`, `tapCancel`, `pinResult`, `debugFire`. `onPhase` is `SessionPhase.modulePayload`; `onMotion` is `HeadMotionStream.readouts` → `MotionReadout.modulePayload`.
- `stop()` returns false and does nothing during a check-in or an open escalation. After a duress PIN it shows idle but keeps the server session alive until the alert is resolved.
- The Recorder screen needs two module methods that aren't in the agreed API yet: `startRecording(label, person)` and `stopRecording() → file URI`. This is a `CONTRACT:` change.
