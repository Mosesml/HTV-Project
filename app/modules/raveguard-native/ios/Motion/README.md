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
| `MotionClassifier.swift` | BL4: dancing, walking or still from mean rotation and acceleration over 1.25 s, held 1.5 s before it shows; still is judged against 20% of the wearer's own active rotation, learned in the first 15 min |
| `../Session/StillnessWatch.swift` | BL3: still for 2 min while monitoring (demo 30 s) starts a check-in; then waits for walking or dancing before it can fire again |
| `NodDetector.swift` | ≥ 2 pitch reversals of ≥ 12° within 2 s, mostly pitch, body fairly still |
| `MotionCSV.swift`, `MotionRecorder.swift` | Fixture format and the J4 recorder |
| `MotionReplay.swift` | J5 harness: replays a folder of takes and scores the J6/J7 bars |
| `../Session/SessionManager*.swift` | Check-in state machine, timings, clock |
| `../Session/SessionLog.swift` | On-device log (A11): JSON Lines in `Application Support/RaveGuard/`, excluded from backup, never uploaded; the only record of a duress PIN |
| `../Session/BriefFactsBuilder.swift` | Log → `BriefFacts` (A12): last active state and until when, prompts unanswered |

## Recording fixtures (J4)

One take per file in `Motion/Fixtures/`, named `<person>_<label>_<take>.csv`, with label one of `dancing`, `walking`, `sitdown`, `fall`, `nod`. Start every take standing (or sitting) upright for at least 2 s: the first second sets the upright baseline.

| Label | Per person | Take length |
| --- | --- | --- |
| `dancing` | 5 min, with jumps | one take |
| `walking` | 3 min, walking and standing | one take |
| `sitdown` | 10 | ~10 s each |
| `fall` | 10, onto a mattress, then lie still 15 s | ~20 s each |
| `nod` | 10, music loud | ~6 s each |
| `still` | 2 min, standing or sitting, not moving | one take |

From the phone: the Recorder screen (React Native) calls the module's recorder and AirDrops the CSV. From a Mac with the AirPods: `Tools/MotionProbe/run.sh record fall justin 20`.

## Tuning (J6, J7, BL4)

Run `swift test` or `motion-probe replay`; the replay test fails with the bar it missed. Thresholds live in `FallDetectorConfig`, `NodDetectorConfig` and `MotionClassifierConfig`; the 2 min / 30 s stillness trigger is `SessionTimings.stillnessTrigger`. Replay also scores each `dancing`, `walking` and `still` take by the share of time shown as that state (bar: 90%). Each take replays on a fresh pipeline, so the wearer's personal stillness threshold (it needs 60 s of activity) isn't in play there; replay checks the 0.35 rad/s ceiling, and the baseline is covered by the classifier tests. The current values are the PRD's starting points, and the detectors pass on synthetic clips only. Nothing is proven on real people until the fixtures are in.

## Integration notes for the module (J12, with Kean)

- The podspec must exclude this package's dev files: `s.exclude_files = ["Tests/**", "Tools/**", "Package.swift"]`.
- `SessionManager(config:clock:escalation:log:prompter:motion:)` with `SystemSessionClock()`, Andy's `ServerClient` (or `FakeEscalationService`), Andy's `SessionLog`, Moses's `VoicePrompter` (conforms to `SessionPrompter`), and `HeadMotionStream()`.
- Module methods map one to one: `configure`, `start`, `stop`, `tapCancel`, `pinResult`, `debugFire`. `onPhase` is `SessionPhase.modulePayload`; `onMotion` is `HeadMotionStream.readouts` → `MotionReadout.modulePayload`.
- Done for motion (J12, Kean): on iOS `RaveGuardRuntime.withFakes` builds one `HeadMotionStream()` as the session's motion source, so real fall, nod and stillness triggers reach `SessionManager`, and `Module/LiveMotionFeed.swift` sends its readouts as `onMotion` while a session runs (dropping the readout hub's replay from the previous session). `airPodsConnected` becomes the module's `onAirPods` event and the snapshot's `airPodsConnected`. `swift test` on a Mac still uses `FakeMotionSource` and the canned sway.
- `airPodsConnected` reports changes only: from CoreMotion's connect and disconnect, and from the first sample while not known to be connected, because iOS may not call `headphoneMotionManagerDidConnect` for AirPods already in the ears when updates start. An update error with Motion & Fitness denied stops the stream instead of retrying every second; the next session's `start()` throws `notAuthorized`, which `SessionManager` logs.
- `stop()` returns false and does nothing during a check-in or an open escalation. After a duress PIN it shows idle but keeps the server session alive until the alert is resolved.
- The Recorder screen needs two module methods that aren't in the agreed API yet: `startRecording(label, person)` and `stopRecording() → file URI`. This is a `CONTRACT:` change.
