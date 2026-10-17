# RaveGuard work order

Oct 17, 2026, status as of the evening of Oct 17

> Snapshot of the live doc, which is the source of truth (task status lives there): https://claude.ai/code/artifact/c3f76f2d-7579-41dd-a429-54f7aaa95460

Kean builds the React Native app, Moses builds native AirPods noise control, Justin builds motion detection and the check-in session, and Andy builds the escalation server. Anything not assigned below sits in the backlog for whoever finishes first. Where this work order and the PRD disagree, this work order wins.

## Where we are

Every screen, the PIN gate, the Debug panel, the session ladder, live AirPods motion, automatic protection and the escalation server run today, with the redesigned UI, on `main`. What still stands between us and the seven scenarios on the real stack:

1. **Hosting and SMS (Andy).** The server is not deployed (AN1), Twilio is not set up (AN3), and the engine still uses simulated delivery (AN6). Until then, the phone uses the fake escalation service unless the build sets `RG_SERVER_URL`.
2. **Voice prompts (Moses).** `VoicePrompter` (M6) is not built; the module still uses a fake.
3. **Session log and location (Andy).** `SessionLog` and `BriefFactsBuilder` (AN9) and location (AN10) are not built.
4. **Motion recordings (all four).** No real recordings exist yet, so the fall and nod detectors are tuned only on synthetic clips. The couch recording session (K13) doubles as J4's recordings; the plan is [docs/fall-model-plan.md](docs/fall-model-plan.md).
5. **Locked-phone test (Justin).** Nobody has run the 5-minute locked-screen test (J2) yet.
6. **Shortcuts loop (a teammate, in progress).** In automatic protection, each mode switch brings the Shortcuts app to the front, so it can loop between the app and Shortcuts. A teammate is fixing it.

## Changes from the PRD

Four decisions in the [PRD](PRD.md) change. Everything else in it, including the seven scenarios, the contracts and the gates, still stands.

| Area | PRD said | Now |
| --- | --- | --- |
| App framework | Native SwiftUI, one target | React Native (Expo SDK 57 dev build) for every screen; sensors, session, server calls and audio stay in Swift as a native module |
| Screens | Six screens | 14 screens from the UI redesign: Setup steps 1–4, Home, Active session, Check-in (whisper and loud), PIN gate, Cancelling, Cancelled, Alert, SOS and Debug. Mockups are in `docs/design/` |
| Noise control | Shortcuts backend only; bridge cut | Confirmed: the iPhone launches `RG Adaptive` below protection level 70 and `RG Noise Cancellation` at 70 or above; the Linux bridge remains cut |
| Owners | Owner A–D by track | Named owners: Kean, Moses, Justin, Andy; unowned work goes to the backlog |

The app does not attempt to control the private Adaptive Audio strength value. Its 0–100 protection value is a RaveGuard policy score, not a percentage of sound blocked. AirPods handle moment-to-moment adjustment in Adaptive mode; RaveGuard escalates to full ANC through Shortcuts when the score reaches 70.

## Who owns what

Each person owns their folders outright. Justin carries the critical path (if AirPods motion doesn't work, nothing else matters), so anyone who finishes early helps Justin first.

| Person | Owns | Folders | PRD tasks absorbed | Est. hours | Start with |
| --- | --- | --- | --- | --- | --- |
| Kean | The React Native app: every screen, settings, PIN gate, Debug panel, and the JavaScript side of the native module; plus automatic protection, live motion and the couch-fall model | `app/` (except `app/modules/*/ios/` subfolders owned by others) | D1–D11, C2, A15–A23, plus the new Expo shell | 14 | Expo dev build running on a physical iPhone |
| Moses | Native noise control and audio output: Shortcuts backend, audio session, voice prompts | `ios/Noise/`, `ios/Audio/`, `ios/Voice/` | C7, C8, C16 | 8 | Build and run the two shortcuts on the demo iPhone |
| Justin | Motion detection and the check-in session state machine | `ios/Motion/`, `ios/Session/SessionManager*` | A1–A8, A13, A14, C1, C4–C6, C10, C11 | 15 | Print AirPods Pro 3 pitch to the console |
| Andy | The escalation server, SMS chain, contact page, and the phone-side server client, log, brief facts and location | `server/`, `ios/Escalation/`, `ios/Session/SessionLog*`, `ios/Session/BriefFacts*`, `ios/Location/` | B1–B12, B14, B17, A11, A12, C9 | 15 | Deploy the server and send a test SMS |

The `ios/` folders above all sit inside the native module at `app/modules/raveguard-native/ios/`. Kean's automatic protection code is in `ios/Hearing/`.

```text
repo/
├── app/                                 Expo React Native app, TypeScript      (Kean)
│   ├── src/screens/ src/ui/ src/settings/   Screens, UI kit, settings, PIN gate   (Kean)
│   └── modules/raveguard-native/
│       ├── index.ts, RaveGuardModule.swift   JS API + Swift glue              (Kean)
│       └── ios/
│           ├── Shared/Contracts.swift      PRD contracts                 (all, by agreement)
│           ├── Module/                     Runtime that wires the pieces together (Kean)
│           ├── Motion/  Session/SessionManager                                (Justin)
│           ├── Hearing/                    Level, dose, protection loop        (Kean)
│           ├── Noise/  Audio/  Voice/                                          (Moses)
│           └── Escalation/  Session/SessionLog  Location/                     (Andy)
├── server/                              Node + Express escalation server      (Andy)
├── docs/                                Design mockups, handoffs, fall-model plan
└── PRD.md, WORK_ORDER.md
```

## The seam: Swift vs React Native

Anything that must keep running with the screen locked lives in Swift; React Native only draws screens and sends taps down. iOS can suspend the JavaScript thread while the phone is locked, but a Swift session holding the audio background mode keeps running, so the ladder, timers, motion, prompts, heartbeats and server calls never depend on JavaScript.

- **Swift owns:** motion and detectors, the session state machine and its timers, voice prompts and the audio session, the server client and heartbeat, location, noise output, and the hearing loop. The PRD's Swift contracts still apply inside the module.
- **React Native owns:** every screen, settings storage, PIN verification (salted hashes in `expo-secure-store`), the Debug panel.
- **Dev build only.** Expo Go can't load custom native modules, so everyone runs `npm run ios:device` from `app/`.
- **Real or fake, per piece.** The module runs the real `SessionManager` and, on iOS, the real `HeadMotionStream`. It uses Andy's `ServerClient` when the build sets `RG_SERVER_URL` and `FakeEscalationService` otherwise. Voice prompts and the session log are still fakes.

The module API below replaces the PRD's `SessionModel` protocol. Everyone builds against it; changing it needs a yes from every owner listed.

| Kind | Name | Payload | Swift behind it |
| --- | --- | --- | --- |
| Method | `configure(settings)` | wearerName, selfDescription, meetingSpot, recipients[], intervalMin, loudnessTarget, demo, teammatePhone | Justin, Andy |
| Method | `startSession()` / `stopSession()` | none | Justin |
| Method | `tapCancel()` | none | Justin |
| Method | `pinResult(kind)` | `safe`, `duress` or `wrong`; 3 wrong fires the escalation | Justin |
| Method | `setProtectionLevel(level)` | 0–100 from the manual slider | Moses |
| Method | `setProtectionMode(mode)` | `auto` (the level loop drives protection) or `manual` (the slider does) | Kean |
| Method | `setNoiseBackend(kind)` | `shortcuts` or `off` | Moses |
| Method | `handleNoiseCallbackURL(url)` | The `raveguard://` return URL from Shortcuts | Moses |
| Method | `debugFire(scenario)` / `debugSetOffline(on)` | 1–7 / simulate the phone going offline | Justin |
| Method | `getSnapshot()` | Current phase, motion, noise, hearing, AirPods, next check-in | Kean |
| Event | `onPhase` | phase, stage, stageEndsAt, escalationId, trigger | Justin |
| Event | `onMotion` | state, pitch, roll, accelG, at 10 Hz | Justin |
| Event | `onAirPods` | connected | Justin |
| Event | `onEscalation` | EscalationStatus from the PRD | Andy |
| Event | `onNoise` | backend, connected, level | Moses |
| Event | `onHearing` | roomDb, dosePercent, mode, inEarDb, floorLevel; readings are null until a level source reports | Kean |

**Duress rule.** The PIN screen shows the same "Cancelled. Stay safe." screen for both PINs, then calls `pinResult` without waiting for it. After a duress PIN, Swift keeps emitting `monitoring` in `onPhase` and never sends an `onEscalation` that the Alert screen would show.

## Kean: React Native app

Every screen is built, redesigned and merged. What is left on the screens is checking them on a phone; the new work is the couch-fall model.

| ID | Task | PRD | Pri | Gate | Depends on | Done when | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| K1 | Expo app in TypeScript with a dev build; `app.json` sets mic, motion and location usage strings, audio and location background modes, URL scheme `raveguard://` | D1, C2 | P0 | First | None | All 4 people run the dev build on their own iPhone | Done: runs on Kean's iPhone; each teammate builds with their own `RG_BUNDLE_SUFFIX` |
| K2 | Native module `raveguard-native` (Expo Modules API): the JS API from the seam table, Swift glue, and a fake that emits canned events | New | P0 | G1 | K1 | Screens receive `onPhase` and `onMotion` from the fake; the other three can add Swift files to `ios/` | Done |
| K3 | Navigation shell with every screen skeletal: Setup, Active session, Check-in, PIN entry, Alert, Debug | D3 | P0 | G1 | K2 | Every screen reachable on the phone | Done; all 14 redesigned screens reachable |
| K4 | Settings storage: recipients and their order, per-recipient permissions, interval, loudness target and self-description; sent through `configure()` | D4 | P0 | G1 | K2 | Settings survive a relaunch | Done; adds the meeting spot |
| K5 | Setup flow, including both PINs (must differ) | D5 | P0 | G1 | K4 | Scenario 7's setup is done in under 60 s | Done as the four-step setup; the 60 s timing is not yet measured on a phone |
| K6 | PIN gate: salted hashes in `expo-secure-store`; returns safe, duress or wrong; calls `pinResult` | D6 | P0 | G1 | K4 | Unit tests for all three results | Done |
| K7 | Check-in screen: countdown ring from `stageEndsAt`, "Are you okay?", Cancel ≥ 60 pt calling `tapCancel` | D8 | P0 | G1 | K3 | Usable one-handed in the dark | Done (whisper and loud stages); one-handed check on a phone pending |
| K8 | Active session screen, with the manual protection slider calling `setProtectionLevel` | D9, HRG-5 | P0 | G1 | K3 | The slider changes Moses's fake noise output | Done, with the Automatic / Manual control and the Hearing card |
| K9 | Duress-identical cancel: one code path, fixed 600 ms "Cancelling…", same haptic, same "Cancelled. Stay safe." screen | D7 | P0 | G2 | K6 | Side-by-side recordings of both PINs match frame for frame | Done; a frame test passes; the side-by-side phone recording is pending |
| K10 | Alert screen from `onEscalation`: who was texted, who acknowledged, Call button (teammate's number in demo) | D10 | P0 | G2 | K3 | An ack on Contact 1's page shows here within 5 s | Done, plus the SOS screen; the real-page ack waits on AN1 and AN3 |
| K11 | Debug panel: 7 scenario buttons calling `debugFire`, live motion readout, demo toggle, noise backend picker | D11 | P0 | G2 | K3 | Each of the 7 buttons fires its scenario | Done; each scenario reaches the check-in in tests; real-stack runs wait on J12 |
| K12 | Couch-fall baseline: 5 couch falls + 5 couch sit-downs through today's `FallDetector` | A15 | P1 | G2 | J5 | Table of what fires, posted to the team | Ready to start: steps in [docs/fall-model-plan.md](docs/fall-model-plan.md) |
| K13 | Recording session, all four, to the PRD's couch protocol (falls, sit-downs, lie-downs, dancing, walking, nods, still); doubles as J4's recordings | A16 | P1 | G2 | K12 | Labelled takes in `ios/Motion/Fixtures/` | Not started |
| K14 | Tiger Data dataset: sign up, schema, upload script in `ml/dataset/`, leave-one-person-out splits | A17 | P2 | G2 | K13 | All takes uploaded; 4 folds returned | Not started |
| K15 | Retune fall thresholds on the couch data | A18 | P1 | G3 | K13 | DET-7 passes on replay, or the gap is known | Not started |
| K16 | `motion-augment`: augmented training falls, training folds only | A19 | P2 | G3 | K13 | 8 variants per training fall; no test-fold take augmented | Not started |
| K17 | `fall-train`: Create ML boosted-tree fall model | A20 | P2 | G3 | K14, K16 | `FallModel.mlmodel` under 1 MB | Not started |
| K18 | Evaluate thresholds vs retuned vs model, leave-one-person-out | A21 | P2 | G3 | K15, K17 | Results in `Motion/README.md`; ship decision recorded | Not started |
| K19 | `LearnedFallDetector` in the app, thresholds as fallback | A22 | P2 | G3 | K18 passes | Same replay results from the app's code path | Not started |
| K20 | Demo rehearsal on the demo couch: 10 falls, 10 sit-downs, 5 lie-downs | A23 | P1 | G3 | K15 or K19, J12 | Counts recorded for the slides | Not started |

## Moses: native noise control and audio

Noise control stays entirely on the iPhone. Two user-created shortcuts select Adaptive or full Noise Cancellation; the app applies a 25-second dwell so changing input does not repeatedly switch apps or modes. Direct Adaptive-strength control remains out because iOS exposes no supported third-party API for it.

| ID | Task | PRD | Pri | Gate | Depends on | Done when | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | Linux handshake test | New | — | — | — | Removed by the native-only decision | Cut |
| M2 | Linux bridge daemon | New | — | — | — | Removed by the native-only decision | Cut |
| M3 | `BridgeController.swift` | New | — | — | — | Removed by the native-only decision | Cut |
| M4 | `ShortcutsController.swift`: `RG Adaptive` and `RG Noise Cancellation`, x-callback URL back to `raveguard://`, 25 s dwell | C16 | P0 | G2 | K2 | Mode switches with the app in front and returns to it | Implemented; the return URL keeps the current screen. Known issue: in automatic protection, switches can loop between the app and Shortcuts; a teammate is fixing it |
| M5 | Audio session: `.playAndRecord`, built-in mic as input, `.allowBluetoothA2DP` and never `.allowBluetooth`; no Expo audio library may override it | C8 | P0 | G1 | K2 | The mic keeps metering while a prompt plays at full quality | Implemented; the AirPods route check waits on M6 |
| M6 | `VoicePrompter`: quiet whisper "Nod if you're okay", then louder "Are you okay? Nod, or tap Cancel", with haptics; called by Justin's session | C7 | P0 | G1 | M5 | Heard in the AirPods, not on the speaker | Not started; the module uses a fake prompter |
| M7 | Linux bridge demo rig | New | — | — | — | Removed by the native-only decision | Cut |

## Justin: motion detection and session core

The session core is done. What is left needs people and phones: the locked-screen test, the recordings and the live rates.

| ID | Task | PRD | Pri | Gate | Depends on | Done when | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| J1 | Print AirPods Pro 3 pitch, roll and yaw to the console | A1 | P0 | First | None | Values stream at ~50 Hz and follow head movement | Done: `Tools/MotionProbe/run.sh` on a Mac, and live in the app on a phone |
| J2 | Background test in the dev build: audio background mode, mic running, phone locked for 5 min | C1 | P0 | First | J1, K1 | Written verdict in the team chat: do motion samples and timers keep arriving while locked? | Not started; unblocked now that K1 is done |
| J3 | `HeadMotionStream` plus `FakeMotionSource`; publish samples and AirPods connect/disconnect | A2, A3 | P0 | G1 | J1 | Survives AirPods out and back in without a restart | Done; works on a phone with real AirPods |
| J4 | Recorder screen (CSV, label picker, AirDrop) and record data: 4 people × dancing, walking, sit-downs, 10 falls onto a mattress, 10 nods with music loud | A4, A5 | P0 | G1 | J3 | Labelled clips in `ios/Motion/Fixtures/` | Tools done; recording not started. Record on the couch with K13's protocol instead of a mattress |
| J5 | Replay harness: XCTest feeds each CSV through the detectors | A6 | P0 | G1 | J4 | Test prints detections per class | Done; also scores motion state |
| J6 | `FallDetector`: spike + posture + 10 s stillness, with a reason string | A7 | P0 | G2 | J5 | On replay: ≥ 8 of 10 falls, ≤ 1 trigger per 30 min of dancing, 0 on sit-downs | In progress: passes on synthetic clips; needs real recordings |
| J7 | `NodDetector`: ≥ 2 pitch reversals of ≥ 12° within 2 s, only while listening | A8 | P0 | G2 | J5 | On replay: ≥ 9 of 10 nods, 0 during dancing | In progress: passes on synthetic clips; needs real recordings |
| J8 | `SessionManager` state machine: pure logic, injected clock, one test per transition | C4 | P0 | G1 | Contracts | Tests cover nod, tap, safe PIN, duress PIN, 3 wrong PINs, timeout | Done |
| J9 | Check-in scheduler plus trigger intake from the motion source | C5 | P0 | G1 | J8, J3 | A fake trigger starts a check-in | Done |
| J10 | Escalation wiring: register at check-in start, update each stage, cancel, fire after 3 wrong PINs, poll while escalated, go to SOS on the server's word | C6 | P0 | G1 | J8, AN2 | Full ladder runs against Andy's `FakeEscalationService` | Done: ladder verified against Andy's `FakeEscalationService` (scenarios 1, 2, 3, 5, 6, late cancel, 3 wrong PINs, real and demo SOS timing) |
| J11 | Demo timings in the session config; a test asserts no emergency number exists in the code | C10 | P0 | G1 | J8 | Demo ladder runs in about 95 s | Done |
| J12 | Integration: put `SessionManager` behind the module in place of Kean's fake, with the real motion stream, Andy's `ServerClient` and Moses's `VoicePrompter` (Kean took over the motion half from Justin) | C11 | P0 | G2 | J6, J10, K2, AN7, M6 | Scenarios 1, 2 and 5 pass on the real stack | In progress. Motion half done (Kean) and working on a phone, with the AirPods connected and disconnected dialogs. Server half done: `ServerClient` is used when the build sets `RG_SERVER_URL`; verified end to end against a local server (a nod cancels; no answer notifies Contact 1). Waiting on AN1 (hosted URL), AN9 (`SessionLog`) and M6 (`VoicePrompter`) |
| J13 | Feed `onMotion` at 10 Hz for the Debug panel | A13 | P0 | G1 | J3, K2 | Debug shows live values | Done; seen on a phone |
| J14 | Measure nod and false-alarm rates live with music at volume; share them for the slides | A14 | P0 | G3 | J6, J7 | Numbers recorded in the team chat | Blocked on J6, J7 |

## Andy: server, SMS chain and contact page

The server runs locally with every P0 route, the engine and the contact page, and the Swift client talks to it. Nothing is hosted and no real SMS has been sent; those are the next two steps. Details are in [docs/andy-work-order-handoff.md](docs/andy-work-order-handoff.md).

| ID | Task | PRD | Pri | Gate | Depends on | Done when | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AN1 | Deploy a hello-world Express app to Railway or Fly with HTTPS and `/health` | B1 | P0 | First | None | A phone on cellular data opens `/health` | Code and Dockerfile done; not deployed (hosting account not chosen) |
| AN2 | `FakeEscalationService.swift`: local timers with the same ladder and timings | B3 | P0 | First | Contracts | Justin runs the full ladder offline | Done |
| AN3 | Twilio: trial account, Canadian number, all 4 phones verified, one test SMS from the server | B2 | P0 | First | AN1 | All 4 phones receive the test SMS | Not started |
| AN4 | Sessions: create (returns a token), heartbeat, delete; bearer-token check; zod validation | B4 | P0 | G1 | AN1 | curl script exercises all three; a bad token gets 401 | Done locally; hosted check after AN1 |
| AN5 | Escalation engine: register, 1 s deadline sweep, cancel (safe or duress), fire, recipient ladder with ack windows, SOS flag | B5 | P0 | G1 | AN4 | Register → deadline → Contact 1 SMS works end to end with curl | Done with simulated delivery; register is idempotent; real SMS after AN3 and AN6 |
| AN6 | SMS sender: normal, duress, reduced and all-clear templates, ≤ 300 chars, one retry, Twilio SID logged | B7 | P0 | G1 | AN3 | Each template arrives on a real phone | In progress: templates and sender done and tested with a fake transport; not wired into the engine |
| AN7 | `ServerClient.swift` implementing `EscalationService`; 10 s heartbeat; cancel retried until it lands | B12 | P0 | G1 | AN4, AN5 | Justin swaps fake for real in one line | Done; J12 uses it when `RG_SERVER_URL` is set |
| AN8 | Brief renderer (full and reduced) and one permission filter used by both SMS and page | B8, B9 | P0 | G1 | Contracts | Test: a recipient without location permission never gets coordinates | Done; times in the wearer's local time |
| AN9 | `SessionLog` (append-only JSON on device) and `BriefFactsBuilder` | A11, A12 | P0 | G2 | Contracts | A canned log produces the expected BriefFacts | Not started; the module uses an in-memory log |
| AN10 | Location: one fix at check-in start, updates only while escalated, none otherwise | C9 | P0 | G2 | AN7 | Network log shows no location outside a check-in | Not started |
| AN11 | Contact page at `/a/:token` (Acknowledge, Mark resolved, 3 s polling, map link) and its duress variant | B10, B11 | P0 | G2 | AN8 | Ack and resolve from a real phone reach the wearer's Alert screen | Done locally (`npm run demo:contact`); real-phone check after AN1 and AN3 |
| AN12 | Engine tests with fake timers: one per scenario | B6 | P0 | G2 | AN5 | `npm test` green | In progress: fake-clock engine tests cover the ladder, duress, ack and resolve, late cancel and permissions; not yet one per scenario |
| AN13 | Snapshot store to JSON, re-arm deadlines on boot, rate limit `/a/*` | B17 | P1 | G2 | AN5 | Restart mid-countdown; it still fires | Not started |
| AN14 | Late cancel: a cancel that lands after firing texts an all-clear | B14 | P1 | G3 | AN6 | Nod offline → reconnect → contacts get the all-clear | Not started; the all-clear template exists |

## Backlog: unassigned

Whoever finishes their P0 tasks first takes the top unclaimed item and types their name in the Owner column. None of these is needed to pass the seven scenarios. The demo and pitch aren't here either: all four do those together after the 05:00 freeze, as the PRD says.

| ID | Task | PRD | Pri | Owner | Done when | Status |
| --- | --- | --- | --- | --- | --- | --- |
| BL1 | Automatic protection: mic level meter, dose tracker and eased level loop driving `setProtectionLevel` in place of the slider; fills `onHearing` | C13–C15 | P1 | Kean, Moses | Adaptive remains selected below 70 and ANC is requested at 70 or above, without rapid switching | Done in code: level and dose loop, demo feed, Automatic / Manual control, Shortcuts routing, mic audio session. Left: the Shortcuts loop fix (M4), and calibrating the mic at 70 and 95 dB on a phone (C13) |
| BL2 | AirPods disconnect: log, banner, on-screen check-ins with haptics | C12 | P1 | Kean | Taking the AirPods out mid-session doesn't escalate | In progress: connected, disconnected and no-motion dialogs work on a phone; the on-screen check-in fallback is not built |
| BL3 | Stillness trigger against the wearer's own baseline | A10 | P1 | Kean (Justin's area) | Sitting motionless for 30 s in demo mode starts a check-in | Done on synthetic clips and live through J12's motion half; needs real recordings |
| BL4 | Motion state classifier: dancing, walking, still, fallen | A9 | P1 | Kean (Justin's area) | State on the Active session screen matches the activity within 3 s | Done on synthetic clips and shown live on a phone; needs real recordings to tune |
| BL5 | Venue staff wide view for the laptop | B13 | P1 | Unassigned | Opens from the staff SMS link on the demo laptop | Not started; a mockup is in `docs/design/screens/Venue-Staff.html` |
| BL6 | Lost-contact watchdog: no heartbeat and nothing pending sends a soft SMS | B16 | P1 | Unassigned | Airplane mode with no check-in pending sends it after 30 s in demo mode | Not started |
| BL7 | Brief rewording with Claude Haiku 5.5, 3 s timeout, template fallback | B15 | P1 | Unassigned | With the API key removed, briefs still send from the template | Not started |
| BL8 | Accessibility pass on the Check-in and PIN screens | D12 | P1 | Unassigned | VoiceOver reads Check-in in a sensible order | Partly done: the redesign added VoiceOver labels and order; a pass on a phone is pending |
| BL9 | Reply "OK" by SMS to acknowledge | WEB-6 | P2 | Unassigned | An SMS reply shows as acknowledged on the wearer's phone | Not started |
| BL10 | Bass-focused filtering via the AirPods' Customized Transparency packet | New | — | — | Requires a non-iOS bridge and is outside the native-only scope | Cut |

## Open questions

- [ ] **Gate times.** The PRD's gates assumed work started Friday night. Do G1 (Sat 13:00) and G2 (Sat 20:00) still hold, or do they shift?
- [ ] **Hosting.** Railway or Fly, and whose account? AN1, AN3 and every real-stack scenario wait on it.
