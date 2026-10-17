# RaveGuard PRD

Oct 16, 2026, statuses updated the evening of Oct 17

> Snapshot of the live doc, which is the source of truth (diagrams and task status live there): https://claude.ai/code/artifact/648c4b37-648f-47f1-b7fb-f0da427474b7

RaveGuard ships a demo-ready iOS app, a hosted Node escalation server and an SMS contact flow by Oct 18, 2026 at 09:00, with all seven brief scenarios passing on real hardware. Four tracks (A–D) build in parallel against shared contracts frozen Friday night, so nobody waits on anybody until integration.

**Status, Oct 17 evening.** The [work order](WORK_ORDER.md) assigns these tasks to Kean, Moses, Justin and Andy, and wins where the two disagree. Every screen (redesigned), the PIN gate, the Debug panel, the session ladder, live AirPods motion, automatic protection, the server engine and the contact page are built and merged. Voice prompts (C7) are now wired, but their AirPods, mic and locked-phone acceptance checks remain open. Also missing for the real stack: hosting and real SMS (B1, B2, B7), the session log and location (A11, A12, C9), real motion recordings (A5, A16) and the locked-phone test (C1). The Status column in each track table below mirrors the work order.

## Decisions locked

These are settled; reopening one costs build time and needs the whole team. Everything else in the design doc stands unless this PRD says otherwise.

| Area | Decision | Why |
| --- | --- | --- |
| Platform | iOS 17+. Screens in React Native (Expo SDK 57 dev build); motion, session, audio, noise and server calls in Swift, inside the app's native module | Swift is the only route to AirPods head motion and noise control, and keeps running with the screen locked; React Native was faster for the screens |
| Contact delivery | SMS via Twilio, linking to a mobile web page | Contacts have no app, so iOS push cannot reach them; SMS survives congested venue networks |
| Server | Node + Express, hosted on an always-on host (Railway or Fly) | Public URL for Twilio webhooks and contact phones on cellular; scenario 4 needs the server off the venue network |
| Brief | Server renders a deterministic template; Claude Haiku 5.5 polishes it with a 3 s timeout, template on failure | Always produces a brief; the "explains why it flagged" claim stays strong |
| Brief location | Template lives on the server, not the phone | The server must write the brief when the phone is dead |
| Recipients | Contact 1 → Contact 2 → Venue staff → SOS screen | Venue staff tier is in scope; staff sit between contacts and SOS |
| Noise control | Shortcuts backend only | Bridge backend and handshake test are out |
| Hearing scope | Level meter, dose, eased level loop, Shortcuts output | SoundAnalysis transparency windows are out |
| AirPods disconnect | Soft signal; session falls back to on-screen check-ins | Phone-motion fallback detector is out |
| Fall classifier | Hand-tuned thresholds on recorded data. A small on-device Core ML model may replace the impact check, only if it beats the thresholds on replay (A15–A23). Falls are recorded, tuned and demoed onto a couch | The demo falls onto a couch, whose landings are softer than the 2.5 g spike; detection must stay on the phone and work offline |
| Emergency call | Never dials 911; demo SOS dials a teammate | Brief requires simulation only |
| Deadline | Submission Sunday 09:00; code freeze Sunday 05:00 | Four hours for all four to build the demo and pitch together |

## Goals, non-goals and success metrics

The build wins on impact (30%) and reliability (25%), so the goal is a system that gets help to someone who cannot ask for it, and keeps working when the phone, the network or a contact fails.

**Goals**

1. Close the gap between incapacity and help being initiated, with no conscious action from the wearer.
2. Keep escalation alive when the phone dies, goes offline or is taken.
3. Make every step cancellable with the least capacity possible: nod, then tap, then PIN.
4. Share only what each recipient is permitted to see, and only at escalation.
5. Give a reason to wear AirPods all night: adaptive protection driven by measured level and dose.

**Non-goals**

- Diagnosing intoxication, drugging or unconsciousness. The system detects unresponsiveness and calls for help; copy never claims more.
- Calling emergency services automatically.
- Continuous noise dial (bridge), sound-event transparency, phone-motion fallback, and any Core ML beyond the optional fall model (DET-8).
- Accounts, sign-in, or any database beyond an in-memory store plus a flat file.
- Android or web wearer app.

**Success metrics**, measured Saturday and stated in the pitch:

| Metric | Target | Measured by |
| --- | --- | --- |
| Scenarios passing on the real stack | 7 of 7 | All four, two full rehearsals |
| Nod detection with music at venue volume | ≥ 9 of 10 nods | Track A, 3 people × 10 nods |
| Fall triggers during dancing | ≤ 1 per 30 min per person | Track A, 3 people × 10 min |
| Controlled falls detected | ≥ 8 of 10 | Track A, onto the demo couch (A23) |
| Server fires after deadline | ≤ 5 s late | Track B, server log |
| SMS arrives after server fires | ≤ 15 s | Track B, 10 sends |
| Duress vs safe cancel screens | No visible difference, timing within 100 ms | Track D, side-by-side recording |

## Acceptance: the seven scenarios

The build is done when all seven pass twice in a row on the real stack: hosted server, real Twilio SMS, real AirPods. Demo devices: wearer iPhone + AirPods Pro 3, Contact 1 phone, Contact 2 phone, and a laptop showing the venue staff page (staff SMS goes to a fourth phone or to Contact 2's). Every scenario can also be fired from the Debug screen.

| # | Scenario | Steps | Pass when | Tracks |
| --- | --- | --- | --- | --- |
| 1 | Safe | Session running → check-in fires → wearer nods | Prompt stops within 1 s of the nod; server escalation cancelled; event in session log; no SMS sent | A, C, B |
| 2 | No response | Trigger a fall → ignore all prompts and the PIN gate | Server fires at deadline; Contact 1 gets SMS with link; page shows brief | A, C, B |
| 3 | Duress | Trigger → reach PIN gate → enter duress PIN | Wearer screen identical to a safe cancel; Contact 1 gets a duress-flagged SMS within 15 s; wearer UI shows no trace of it | D, C, B |
| 4 | Connectivity failure | Trigger → airplane mode on wearer phone mid-countdown | Server fires on schedule; Contact 1 SMS arrives; brief says the phone went silent at HH:MM | B, C |
| 5 | Unacknowledged | Scenario 2, Contact 1 does nothing | After the ack window Contact 2 is texted, then venue staff, then wearer phone shows the SOS screen | B, C, D |
| 6 | False alarm | Trigger → let it reach Contact 1 → Contact 1 taps Mark resolved, or wearer taps Cancel before the deadline | Chain stops; no further SMS; wearer phone returns to the active session; event logged | B, D |
| 7 | Privacy | Contact 1 can see location, Contact 2 cannot; fire scenario 5 | Contact 2's SMS and page carry no location and a reduced brief; both pages shown side by side | B, D |

## Requirements

P0 means a scenario fails without it. P1 means it should ship. P2 is only if there's time left. Task IDs in the track sections point back to these requirement IDs.

| ID | Requirement | Pri | Track |
| --- | --- | --- | --- |
| SES-1 | User starts and stops a session deliberately; it never starts automatically | P0 | C |
| SES-2 | Scheduled check-ins at the user's interval (30 or 60 min), plus check-ins triggered by a MotionEvent | P0 | C |
| SES-3 | Check-in ladder: whispered prompt → louder prompt + haptic → PIN gate → escalated, with timings from SessionConfig | P0 | C |
| SES-4 | A nod or a tap at either prompt stage cancels; only the PIN gate needs a PIN | P0 | C |
| SES-5 | Every check-in, cancel, trigger and escalation is written to SessionLog (JSON on device, never transmitted) | P0 | A |
| SES-6 | The session survives a locked screen through audio background mode; if the Friday spike fails, stay foregrounded with the idle timer disabled | P0 | C |
| SES-7 | AirPods disconnect is a soft signal: log it, show a banner, switch to on-screen check-ins with haptics | P1 | C |
| SES-8 | Ending a session deletes its server record | P0 | B |
| DET-1 | Head motion at about 50 Hz from CMHeadphoneMotionManager, with a live readout on the Debug screen | P0 | A |
| DET-2 | Fall = acceleration spike + posture far from upright + stillness below baseline for 10 s, all three together | P0 | A |
| DET-3 | Prolonged stillness against the wearer's own baseline (first 15 min of the session) triggers a check-in | P1 | A |
| DET-4 | Nod = at least 2 pitch reversals of ≥ 12° within 2 s, listened for only while a prompt is active | P0 | A |
| DET-5 | Motion state shown live: dancing, walking, still, fallen | P1 | A |
| DET-6 | Every trigger carries a readable reason, e.g. "spike 3.1 g, head 70° sideways, still 12 s" | P0 | A |
| DET-7 | A fall onto a couch (the demo's fall) is detected: on replay, ≥ 8 of 10 per person, and 0 triggers on hard sit-downs or deliberate lie-downs on the same couch | P1 | A |
| DET-8 | A learned fall model runs on the phone (Core ML), replaces only the impact check, and ships only if it beats the tuned thresholds on replay; the thresholds stay as the fallback | P2 | A |
| ESC-1 | The phone registers an escalation with its deadline when a check-in starts; from then on the server owns the clock | P0 | B |
| ESC-2 | Safe cancel stops the escalation; duress cancel fires it immediately with a duress flag | P0 | B |
| ESC-3 | When the deadline passes, recipients are notified in order, each with an acknowledgement window | P0 | B |
| ESC-4 | Heartbeat every 10 s; a silent phone never stops a pending escalation, and the brief records when it went silent | P0 | B |
| ESC-5 | Heartbeat lost for over 3 min with nothing pending sends a soft "lost contact" SMS to Contact 1 only | P1 | B |
| ESC-6 | The store survives a server restart: flat-file snapshot, timers re-armed on boot | P1 | B |
| ESC-7 | Three wrong PINs fire the escalation immediately | P0 | D |
| ESC-8 | Per-recipient permissions are applied on the server to every SMS and page | P0 | B |
| ESC-9 | Every SMS fits in 2 segments (≤ 300 characters) | P1 | B |
| WEB-1 | Contact page /a/:token: brief, minutes since trigger, map link if permitted, Acknowledge, Mark resolved | P0 | B |
| WEB-2 | Acknowledge stops the chain timer; Mark resolved closes the escalation and the wearer's phone sees it within 5 s | P0 | B |
| WEB-3 | Duress view: banner "Do not call or text them openly", no Call button | P0 | B |
| WEB-4 | Venue staff view: contact view plus self-description and location, laid out for a laptop | P1 | B |
| WEB-5 | Page refreshes every 3 s to show who has acknowledged | P1 | B |
| WEB-6 | Replying "OK" by SMS acknowledges, through a Twilio webhook | P2 | B |
| BRF-1 | The phone sends structured BriefFacts, never raw sensor data | P0 | A |
| BRF-2 | The server renders the brief from a template, in a full and a reduced variant | P0 | B |
| BRF-3 | LLM polish with Claude Haiku 5.5, 3 s timeout, template fallback; the prompt bans diagnostic words | P1 | B |
| PRV-1 | No sensor data or audio leaves the phone in normal operation; audio is never recorded | P0 | C |
| PRV-2 | Location is sent only from the start of a check-in onward | P0 | C |
| PRV-3 | Permissions screen with four toggles per recipient: alerts, location, full brief, resolve | P0 | D |
| PRV-4 | PINs stored in Keychain as salted hashes | P1 | D |
| UI-1 | Setup: 2 ordered contacts + venue staff, permissions, check-in interval, loudness target, both PINs, self-description | P0 | D |
| UI-2 | Active session: room dB, protection level, dose, motion state, next check-in, large Stop | P0 | D |
| UI-3 | Check-in: full screen, countdown ring, "Are you okay?", large Cancel | P0 | D |
| UI-4 | PIN entry is identical for both PINs: same animation, same delay, same next screen | P0 | D |
| UI-5 | Alert: what was sent, to whom, acknowledgement status, Call button | P0 | D |
| UI-6 | Debug: fire any of the seven scenarios, live sensor readouts, demo/real timing toggle | P0 | D |
| UI-7 | Check-in and PIN screens support Dynamic Type and VoiceOver; tap targets ≥ 60 pt | P1 | D |
| HRG-1 | Phone mic level: RMS to dB plus a calibration offset, once per second | P1 | C |
| HRG-2 | Dose: in-ear level (room dB minus attenuation) accumulated against 85 dB / 8 h with a 3 dB exchange rate, shown as % and labelled an estimate | P1 | C |
| HRG-3 | Level loop: easing 0.2, deadband 2, floor that only rises | P1 | C |
| HRG-4 | ShortcutsController: < 70 Adaptive, ≥ 70 Noise Cancellation, 25 s dwell, run by x-callback URL | P1 | C |
| HRG-5 | Fallback: manual protection slider | P0 | C |
| HRG-6 | Voice prompts play through the AirPods while the phone mic stays the input | P0 | C |
| DEM-1 | Demo mode shortens timings; SOS dials a teammate's number; no code path dials 911 | P0 | C |
| DEM-2 | ScenarioSimulator injects fake MotionEvents and a simulated network-off flag | P0 | D |

## Architecture

The phone decides when to ask. Once a check-in starts, the server owns the deadline, so a dead phone still ends in an SMS.

*Diagram: system architecture, with phone modules, server and recipients coloured by track. See the live doc.*

Motion events and nods flow into SessionManager, which runs the ladder and drives the voice prompts. ServerClient registers each check-in with the server, and the server texts recipients through Twilio. A recipient's Acknowledge or Mark resolved goes back to the server, and the phone sees it on its next status poll.

## Escalation ladder

Any answer before the deadline cancels the alert. After the deadline, the server works down the chain whether or not the phone is still alive. A duress PIN skips straight to Contact 1 with a duress flag, while the wearer's screen shows an ordinary cancel.

*Diagram: escalation ladder. Monitoring → Whispered prompt → Louder prompt + haptic → PIN gate → (deadline) → Contact 1 → Contact 2 → Venue staff → SOS screen. A nod, tap or safe PIN cancels; the duress PIN jumps straight to Contact 1; an acknowledgement stops the chain, and a resolve closes it. See the live doc.*

Both outcomes loop back to monitoring: the wearer cancels, or a recipient resolves. Every pass through the ladder is logged on the device, even one cancelled after a single nod.

| Step | Real | Demo |
| --- | --- | --- |
| Scheduled check-in interval | 30 or 60 min (user setting) | Fired from Debug |
| Whispered prompt | 20 s | 10 s |
| Louder prompt + haptic | 20 s | 10 s |
| PIN gate | 30 s | 15 s |
| Server deadline, from check-in start | 70 s | 35 s |
| Ack window: Contact 1, Contact 2, venue staff (each) | 2 min | 20 s |
| SOS screen opens, from check-in start | 7 min 10 s | 95 s |
| Heartbeat interval | 10 s | 10 s |
| Lost-contact threshold, nothing pending | 3 min | 30 s |

The phone's `SessionConfig` and the server both read these values from the session's `demo` flag, so the two clocks can't drift apart.

## Shared contracts

These types and endpoints are the seams between tracks. Write them together in one 45-minute session on Friday night and merge them before anyone writes feature code. After the merge, changing one needs a message in the team channel and a yes from every track it touches.

The Swift contracts live in `app/modules/raveguard-native/ios/Shared/Contracts.swift`. Each track also ships a fake of its own protocol on Friday night, so the other tracks can build against it until the real one lands. With the screens in React Native, `SessionModel` is replaced by the native module's JavaScript API (methods and events), listed in the work order's seam table.

| Protocol | Real implementation | Fake shipped Friday | Consumed by |
| --- | --- | --- | --- |
| `MotionEventSource` | A: `HeadMotionStream` + detectors | A: `FakeMotionSource` (fires on a Debug button) | C |
| `EscalationService` | B: `ServerClient` | B: `FakeEscalationService` (local timers mimicking the server) | C |
| `NoiseController` | C: `ShortcutsController` | C: `FakeNoiseController` (logs the level) | C |
| `SessionModel` | C: `SessionManager` | C: `PreviewSessionModel` (static states for every screen) | D |
| `PINVerifier` | D: `PINGate` | D: `FakePINVerifier` (1111 safe, 9999 duress) | C |
| `SessionLogging` | A: `SessionLog` | A: in-memory log | C, B (via `BriefFacts`) |

```swift
// RaveGuard/Shared/Contracts.swift

enum MotionState: String, Codable { case dancing, walking, still, fallen, unknown }
enum TriggerKind: String, Codable { case fall, stillness, scheduled, manual }

struct Posture: Codable, Equatable { let pitchDeg: Double; let rollDeg: Double }

struct MotionEvent: Codable, Equatable {
    let kind: TriggerKind
    let at: Date
    let reason: String        // "spike 3.1 g, head 70° sideways, still 12 s"
    let posture: Posture?
}

protocol MotionEventSource: AnyObject {
    var states: AsyncStream<MotionState> { get }
    var triggers: AsyncStream<MotionEvent> { get }
    var nods: AsyncStream<Date> { get }
    var airPodsConnected: AsyncStream<Bool> { get }
    func setListeningForNod(_ on: Bool)
    func start() throws
    func stop()
}

enum SessionEventKind: String, Codable {
    case sessionStarted, motionState, trigger, checkInStarted, promptEscalated,
         nod, tapCancel, pinGateOpened, pinSafe, pinDuress, pinWrong,
         escalated, recipientNotified, recipientAcked, resolved,
         airPodsDisconnected, sessionEnded
}
struct SessionEvent: Codable, Identifiable {
    let id: UUID; let at: Date; let kind: SessionEventKind; let detail: String?
}
protocol SessionLogging { func append(_ e: SessionEvent); var events: [SessionEvent] { get } }

enum CheckInStage: String, Codable { case whisper, loud, pinGate }
enum SessionPhase: Equatable {
    case idle, monitoring
    case checkIn(CheckInStage, stageEndsAt: Date)
    case escalated(escalationId: String)
    case sos
}

enum RecipientKind: String, Codable { case contact, venueStaff }
struct PermissionSet: Codable, Equatable {
    var receiveAlerts = true; var seeLocation = false
    var seeFullBrief = false; var canResolve = true
}
struct Contact: Codable, Identifiable, Equatable {
    let id: UUID; var name: String; var phoneE164: String
    var kind: RecipientKind; var order: Int; var permissions: PermissionSet
}

struct GeoPoint: Codable { let lat: Double; let lon: Double; let accuracyM: Double; let at: Date }
struct BriefFacts: Codable {              // the only session data that ever leaves the phone
    let wearerName: String
    let selfDescription: String           // "black hoodie, white cap"
    let lastActiveState: MotionState      // .dancing
    let lastActiveUntil: Date?            // 01:42
    let trigger: MotionEvent
    let promptsUnanswered: Int
    let location: GeoPoint?               // nil until a check-in starts
}

enum CancelMode: String, Codable { case safe, duress }
enum PINResult { case safe, duress, wrong }
protocol PINVerifier { func verify(_ pin: String) -> PINResult }

struct RecipientStatus: Codable { let name: String; let kind: RecipientKind
    let notifiedAt: Date?; let ackedAt: Date? }
struct EscalationStatus: Codable {
    let state: String   // pending | notifying | acknowledged | resolved | cancelled
    let recipients: [RecipientStatus]; let sosOpen: Bool
}

protocol EscalationService {
    func startSession(wearerName: String, selfDescription: String,
                      recipients: [Contact], demo: Bool) async throws
    func heartbeat() async
    func register(deadline: Date, facts: BriefFacts) async throws -> String
    func update(_ escalationId: String, facts: BriefFacts) async throws
    func cancel(_ escalationId: String, mode: CancelMode) async throws
    func fireNow(_ escalationId: String) async throws
    func status(_ escalationId: String) async throws -> EscalationStatus
    func endSession() async throws
}

protocol NoiseController { func apply(level: Int) }   // 0–100

@MainActor protocol SessionModel: Observable {
    var phase: SessionPhase { get }
    var motionState: MotionState { get }
    var roomDb: Double { get }
    var protectionLevel: Int { get }
    var dosePercent: Double { get }
    var nextCheckIn: Date? { get }
    var escalation: EscalationStatus? { get }
    func start(); func stop(); func tapCancel()
    func submitPIN(_ pin: String) -> Bool  // false only for a wrong PIN
}
```

`submitPIN` returns `true` for both the safe and the duress PIN. The UI cannot tell them apart, so it cannot show a difference.

**Server API.** Base URL `https://<host>/v1`. JSON in and out, wrapped in `{ ok, data, error }`. `startSession` returns a bearer token, and every phone call after that sends it. Contact links use a 128-bit random token per recipient per escalation.

| Method + path | Body | Returns | Called by |
| --- | --- | --- | --- |
| POST /v1/sessions | wearerName, selfDescription, recipients\[\], demo | sessionId, token | Phone at Start |
| POST /v1/sessions/:sid/heartbeat | none | 204 | Phone every 10 s |
| DELETE /v1/sessions/:sid | none | 204; record deleted | Phone at Stop |
| POST /v1/sessions/:sid/escalations | deadline (ISO 8601), facts | escalationId | Phone at check-in start |
| PATCH /v1/escalations/:eid | facts | 204 | Phone as stages advance |
| POST /v1/escalations/:eid/cancel | mode: safe or duress | 204, the same for both modes | Phone on nod, tap or PIN |
| POST /v1/escalations/:eid/fire | reason | 204 | Phone after 3 wrong PINs |
| GET /v1/escalations/:eid | none | EscalationStatus | Phone every 3 s while escalated |
| GET /a/:rtoken | none | Contact or venue page (HTML) | Recipient from SMS |
| GET /a/:rtoken/data | none | Brief + status, filtered by that recipient's permissions | The page |
| POST /a/:rtoken/ack | none | 204 | Page button |
| POST /a/:rtoken/resolve | none | 204, or 403 without canResolve | Page button |
| POST /twilio/inbound | Twilio form | TwiML | Twilio (P2) |

## Team and ownership

Each track owns its folders outright. Nobody edits another track's folder without asking, and that rule keeps merge conflicts close to zero. These tracks are rebalanced from the design doc: track B was too large, so the on-device session state machine moves to C, and the PIN gate and scenario simulator move to D.

The work order replaced the four anonymous owners with named people, and splits some tracks between them. The Owner column below shows who has each track's tasks now.

| Track | Owner | Owns (folders) | In one line | Est. hours |
| --- | --- | --- | --- | --- |
| A: Motion and detection | Justin (A1–A8, A13, A14); Kean (A9, A10, A15–A23); Andy (A11, A12) | `Motion/`, `Session/SessionLog*`, `Session/BriefFactsBuilder*` | Turns AirPods motion into states, triggers and nods, and turns the log into BriefFacts | 11 |
| B: Server and recipients | Andy | `server/`, `Escalation/ServerClient*` | Owns the escalation clock, the Twilio SMS chain, the brief text and the contact and venue pages | 12 |
| C: Session core and hearing | Justin (session); Moses (audio, noise, voice); Kean (hearing loop); Andy (location) | `Session/SessionManager*`, `Audio/`, `Noise/`, `Voice/`, `Hearing/` | Runs the check-in ladder, talks to the server, whispers prompts, drives noise control | 12 |
| D: Interface and settings | Kean | `app/src/` (React Native) | Every screen, setup and permissions, both PINs and the Debug panel | 10 |

Assignment guidance:

- **A** goes to whoever is strongest at signal processing. It is the critical path, and the only track that needs recorded data.
- **B** goes to whoever is most comfortable with Node and HTTP. B's Swift is only a thin client.
- **C** goes to whoever is best at Swift concurrency and state machines, since every other track plugs into it.
- **D** goes to whoever is strongest at SwiftUI layout, since the duress screen must match a real cancel frame for frame.
- When a track finishes early, its owner joins the next gate's blocker. By default A helps C, and B helps D.

The demo and the pitch belong to no single track. All four build them together after the code freeze; see Demo and pitch.

## Track A tasks: motion and detection

Track A proves the premise first: if AirPods Pro 3 pitch doesn't print to the console on Friday night, the whole plan changes. After that, every threshold is tuned against recordings replayed in unit tests, not by guesswork on the dance floor. Gates are defined in the Timeline section.

| ID | Task | Req | Pri | Gate | Depends on | Done when | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | Print head-motion pitch, roll and yaw to the console from the Pro 3s | DET-1 | P0 | G0 | Xcode project | Values stream at \~50 Hz and change with head movement | Done (J1): streams on a Mac and live in the app on a phone |
| A2 | Ship `FakeMotionSource` and an in-memory `SessionLog` | SES-5 | P0 | G0 | Contracts | Merged to main; C builds against it | Done (J3): `FakeMotionSource`; the module uses an in-memory log |
| A3 | `HeadMotionStream`: wrap CMHeadphoneMotionManager, publish samples and AirPods connect/disconnect | DET-1 | P0 | G1 | A1 | Survives AirPods out and back in without restarting the app | Done (J3); works on a phone with real AirPods |
| A4 | Recorder screen: CSV of attitude, rotation rate and user acceleration, a label picker, AirDrop export | DET-2 | P0 | G1 | A3 | One labelled CSV per take lands on a Mac | Tools done (J4): `motion-probe record` on a Mac |
| A5 | Record data: 3 people × (5 min dancing with jumps, 3 min walking and standing, 10 sit-downs, 10 controlled falls onto a mattress, 10 nods with music loud) | DET-2, DET-4 | P0 | G1 | A4 | All clips in `Motion/Fixtures/`, labelled | Not started (J4); recorded on the couch with A16's protocol |
| A6 | Replay harness: XCTest feeds each CSV through the detectors and asserts counts per class | DET-2 | P0 | G1 | A5 | `xcodebuild test` prints a table of detections per class | Done (J5); also scores motion state |
| A7 | `FallDetector`: spike + posture + 10 s stillness, with a reason string | DET-2, DET-6 | P0 | G2 | A6 | On replay: ≥ 8 of 10 falls, ≤ 1 trigger per 30 min of dancing, 0 on sit-downs | In progress (J6): passes on synthetic clips; needs real recordings |
| A8 | `NodDetector`: ≥ 2 pitch reversals of ≥ 12° within 2 s, only while listening | DET-4 | P0 | G2 | A6 | On replay: ≥ 9 of 10 nods, 0 during dancing clips while listening | In progress (J7): passes on synthetic clips; needs real recordings |
| A9 | Motion state classifier from motion-energy bands: dancing, walking, still, fallen | DET-5 | P1 | G2 | A6 | State on Debug matches the activity within 3 s | Done on synthetic clips (BL4); shown live on a phone |
| A10 | Stillness trigger against a baseline learned in the first 15 min | DET-3 | P1 | G3 | A9 | Sitting motionless for 2 min (demo: 30 s) triggers a check-in | Done on synthetic clips (BL3) |
| A11 | `SessionLog`: append-only JSON file in Application Support, never uploaded | SES-5 | P0 | G1 | A2 | Log survives an app relaunch; nothing in it hits the network | Not started (AN9) |
| A12 | `BriefFactsBuilder`: log → BriefFacts (last active state and until when, unanswered prompts) | BRF-1 | P0 | G2 | A11 | Unit test: a canned log produces the expected BriefFacts | Not started (AN9) |
| A13 | Expose live values (pitch, roll, \|accel\|, energy, state) for D's Debug screen | DET-1 | P0 | G1 | A3 | Debug shows them updating live | Done (J13); seen on a phone |
| A14 | Measure nod and false-alarm rates live with music at volume; share the numbers with the team for the slides | — | P0 | G3 | A7, A8 | Numbers in the Real vs simulated slide | Blocked on A7, A8 (J14) |

Starting thresholds, which the A6 replays will then tune: spike over 2.5 g of user acceleration; posture over 50° of pitch or roll away from the session baseline; stillness when rotation-rate variance stays below 20% of the wearer's dancing baseline for 10 s.

### Couch falls and a learned fall model (A15–A23, Kean)

The demo shows a fall as a teammate falling onto a couch, so that is the fall we record, tune for and judge by. A couch landing is softer than the 2.5 g spike the thresholds assume, so step one measures whether today's detector catches it at all. A learned model then replaces only the impact check, which is the part a couch breaks: the head going down (posture) and lying still for 10 s still confirm every fall. The model ships only if it beats retuned thresholds on the same replay. If retuning alone passes, that is the cheaper result and the model stays optional.

The step-by-step plan, with commands, the feature list and the SQL, is [docs/fall-model-plan.md](docs/fall-model-plan.md).

Couch falls are not hard-floor falls; the pitch says so plainly. The data is the team's own, recorded by the team. Tiger Data's hackathon credits ($1,000 for 30 days of hosted PostgreSQL with time-series tables) hold the shared dataset. They are not used for training, which runs on a Mac in minutes, and the phone never talks to Tiger Data.

| ID | Task | Req | Pri | Gate | Depends on | Done when | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A15 | Baseline: record 5 couch falls and 5 hard couch sit-downs with `motion-probe record`, replay them through today's `FallDetector` | DET-7 | P1 | G2 | A6 | A table of what fires, posted to the team: spike, tilt and stillness per take | Ready to start (K12): [docs/fall-model-plan.md](docs/fall-model-plan.md) |
| A16 | Recording session, all four people, to the protocol below; doubles as J4's recordings | DET-7, DET-2 | P1 | G2 | A15 | Every take labelled in `Motion/Fixtures/`, counts as in the protocol | Not started (K13) |
| A17 | Tiger Data dataset: sign up, create the schema below, an upload script (CSV → tables) and the split queries | DET-8 | P2 | G2 | A16 | All takes uploaded; the leave-one-person-out splits query returns 4 folds | Not started (K14) |
| A18 | Retune the thresholds on the couch data (spike, tilt, stillness) | DET-7 | P1 | G3 | A16 | Replay table for retuned thresholds; DET-7 passes or the gap is known | Not started (K15) |
| A19 | Augmentation tool (`motion-augment`): more training falls from recorded ones, training folds only | DET-8 | P2 | G3 | A16 | 8 variants per training fall; a test proves no test-fold take is ever augmented | Not started (K16) |
| A20 | Train the model (`fall-train`, Create ML on a Mac) on per-candidate features | DET-8 | P2 | G3 | A17, A19 | `FallModel.mlmodel` under 1 MB, plus its feature list | Not started (K17) |
| A21 | Evaluate: leave-one-person-out replay, thresholds vs retuned vs model, to the bars below | DET-7, DET-8 | P2 | G3 | A18, A20 | Results table in `Motion/README.md`; ship or don't-ship decision recorded | Not started (K18) |
| A22 | Integrate: `LearnedFallDetector` behind the `FallDetector` interface, thresholds as the fallback | DET-8 | P2 | G3 | A21 passes | Same replay results from the app's code path; fallback used if the model fails to load | Not started (K19) |
| A23 | Demo rehearsal on the demo couch with the demo phone: 10 falls, 10 sit-downs, 5 lie-downs | DET-7 | P1 | G3 | A18 or A22, J12 | Counts recorded for the slides (feeds A14) | Not started (K20) |

**Recording protocol (A16).** Per person, wearing AirPods normally, on the demo couch. Every take starts upright and still for 3 s (the posture baseline). A fall take is 17 s: 3 s still, the fall at about the 3 s mark, then motionless to the end (about 12–13 s; the detector needs 10). Record with `Tools/MotionProbe/run.sh record <label> <person> <seconds>` on a Mac, or the phone recorder once it exists. Files are `<person>_<label>_<take>.csv`, with `# surface=couch` and, for falls, `# direction=` in the header.

| Label | Per person | Take | Why |
| --- | --- | --- | --- |
| `fall` | 15: 4 forward, 4 backward, 4 sideways, 3 slow slumps | 17 s | The demo's fall in every direction it can happen |
| `sitdown` | 15: hard drops, normal sits, lean-backs onto the same couch | ~12 s | The closest look-alike; must never fire |
| `liedown` | 5: deliberately lying down on the couch | ~20 s | Head goes down with no fall; must never fire |
| `dancing` | 5 min, with jumps | one take | False alarms per 30 min |
| `walking` | 2 min | one take | State and false alarms |
| `nod` | 10 | ~6 s | Shared with J4/A8 |
| `still` | 2 min | one take | Stillness (BL3) and state |

**Dataset in Tiger Data (A17).** Two tables. `takes` (id, person, label, surface, direction, source, recorded_at, file_name, notes), and `motion_samples`, a hypertable on `ts` (take_id, ts, t, pitch, roll, yaw, rotX/Y/Z, accX/Y/Z, gravX/Y/Z), the CSV's columns. The upload script lives in `ml/dataset/`, reads the connection string from `TIGER_DATABASE_URL` (never committed), and skips files already uploaded. Splits are by person, never by sample: train on three people and test on the fourth, four times. The recordings hold head motion only, no audio or location; everyone agrees before uploading, and the database is deleted after the hackathon.

**Model (A19–A20).** A candidate starts whenever the head tilts past 50° from the baseline. Features come from 2 s before to 3 s after that moment: peak and mean acceleration, peak rotation rate, the speed of the tilt, the final tilt and direction, and acceleration energy before the drop. A boosted-tree classifier (Create ML `MLBoostedTreeClassifier`) labels each candidate fall or not, and the existing 10 s stillness check still has to follow. Augmentation applies to training folds only: mounting rotation ±15°, acceleration and rotation scaled 0.8–1.2, time stretch 0.85–1.15, sensor noise, left-right mirror, and falls spliced after 20 s of the same person dancing or walking.

**Bars (A21).** On every held-out person: couch falls ≥ 8 of 10 caught, within 12 s of the fall; 0 triggers on couch sit-downs and lie-downs; ≤ 1 trigger per 30 min of dancing; 0 on walking, nods and still. The model ships only if it passes every bar and catches more falls than the retuned thresholds; otherwise the retuned thresholds ship.

**In the app (A22).** `FallModel.mlmodel` ships in the native module and is compiled with it. `LearnedFallDetector` keeps `FallDetector`'s interface and reason strings (e.g. "model 0.93, head 70° sideways, still 10 s"). If the model fails to load, the thresholds run instead and the session log says so.

## Track B tasks: server, SMS, contact and venue pages

Track B owns the clock that keeps working after the phone dies, so the escalation engine is built and tested with a fake clock before any UI touches it. The server is a single Node process with no database: a `Map` in memory, snapshotted to a JSON file after every write.

| ID | Task | Req | Pri | Gate | Depends on | Done when | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | Deploy a hello-world Express app to Railway or Fly with HTTPS and `/health` | — | P0 | G0 | None | A phone on cellular data opens `/health` | Code and Dockerfile done; not deployed (AN1) |
| B2 | Twilio: trial account, Canadian number, every demo phone verified, one test SMS sent from the server | ESC-3 | P0 | G0 | B1 | All 4 demo phones receive a test SMS | Not started (AN3) |
| B3 | Ship `FakeEscalationService` in Swift: local timers with the same ladder and timings | ESC-1 | P0 | G0 | Contracts | Merged; C runs the full ladder offline | Done (AN2) |
| B4 | Sessions: create (returns a token), heartbeat, delete; bearer-token check; input validated with zod | SES-8, ESC-4 | P0 | G1 | B1 | curl script exercises all three; a bad token gets 401 | Done locally (AN4); hosted check after B1 |
| B5 | Escalation engine: register, a 1 s sweep loop over deadlines, cancel (safe or duress), fire, the recipient ladder with ack windows, the SOS flag | ESC-1, ESC-2, ESC-3, ESC-7 | P0 | G1 | B4 | Register → deadline → Contact 1 SMS works end to end with curl | Done with simulated delivery (AN5); register is idempotent |
| B6 | Engine tests with fake timers (vitest): scenarios 1–7 at engine level | ESC-1–3 | P0 | G2 | B5 | `npm test` green; one test per scenario | In progress (AN12): engine tests cover the ladder, duress, ack, late cancel and permissions |
| B7 | SMS sender: normal, duress, lost-contact and late-cancel templates, ≤ 300 chars, one retry, Twilio SID logged | ESC-3, ESC-9 | P0 | G1 | B2 | Each template arrives on a real phone | In progress (AN6): templates and sender tested with a fake transport; not wired into the engine |
| B8 | Brief renderer: BriefFacts + server facts (phone silent since HH:MM) → full and reduced text | BRF-2 | P0 | G1 | Contracts | Unit test matches the example brief word for word | Done (AN8); times in the wearer's local time |
| B9 | Permission filter: one `payloadFor(recipient, escalation)` used by both SMS and page | ESC-8 | P0 | G1 | B8 | Test: a recipient without seeLocation never gets coordinates in SMS or JSON | Done (AN8) |
| B10 | Contact page: static HTML + vanilla JS at `/a/:token`; Acknowledge, Mark resolved, 3 s polling, map link | WEB-1, WEB-2, WEB-5 | P0 | G2 | B9 | Ack and resolve from a real phone change the state the wearer's phone sees | Done locally (AN11); real-phone check after B1 and B2 |
| B11 | Duress variant of the page: banner, no Call button, neutral page title | WEB-3 | P0 | G2 | B10 | Scenario 3 passes on the real stack | Done locally (AN11) |
| B12 | `ServerClient.swift` implementing EscalationService; 10 s heartbeat; cancel retried until acked | ESC-4 | P0 | G1 | B4, B5 | C swaps Fake for Real by changing one line | Done (AN7); used when the build sets `RG_SERVER_URL` |
| B13 | Venue staff view: wide layout, self-description, location always shown, staff ack | WEB-4 | P1 | G3 | B10 | Opens on the demo laptop from the staff SMS link | Not started (BL5) |
| B14 | Late cancel: a cancel that lands after firing auto-resolves and texts "Checked in at HH:MM" to everyone notified | ESC-2 | P1 | G3 | B7 | Nod while offline → reconnect → contacts get the all-clear | Not started (AN14); the all-clear template exists |
| B15 | LLM polish with Claude Haiku 5.5: 3 s timeout, template fallback, prompt bans diagnostic words | BRF-3 | P1 | G3 | B8 | With the key removed, briefs still send from the template | Not started (BL7) |
| B16 | Lost-contact watchdog: no heartbeat for 3 min (demo: 30 s) with nothing pending → soft SMS to Contact 1 | ESC-5 | P1 | G3 | B4 | Airplane mode with no check-in pending sends the soft SMS | Not started (BL6) |
| B17 | Snapshot store to JSON after each write; re-arm deadlines on boot; rate limit 60 req/min per IP on `/a/*` | ESC-6 | P1 | G2 | B5 | Restart the server mid-countdown; it still fires | Not started (AN13) |

SMS copy, kept to 2 segments. The link is the recipient's own token.

```text
Normal:   RaveGuard: Alex may need help. Fell at 01:42, still for 3 min, no answer to 2 check-ins. Details: https://rg.app/a/k3J9xQ  Reply OK if you're on it.
Reduced:  RaveGuard: Alex missed a safety check-in at 01:44. Details: https://rg.app/a/p8Lm2T
Duress:   RaveGuard URGENT: Alex signalled for help while appearing to cancel. Do not call or text them openly. https://rg.app/a/Zt71cw
Lost:     RaveGuard: lost contact with Alex's phone at 02:10 during an active session. Last check-in 01:55. https://rg.app/a/r4Ne0b
All-clear: RaveGuard: Alex checked in at 01:46. No action needed.
```

## Track C tasks: session core, voice prompts and hearing

Every other track plugs into Track C, so the session state machine comes first and gets built as pure logic with an injected clock. The hearing feature comes after the ladder works end to end. If time runs out, it drops to the manual slider (HRG-5) without failing any scenario.

| ID | Task | Req | Pri | Gate | Depends on | Done when | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | Background spike: audio and location background modes, mic tap running, phone locked for 5 min | SES-6 | P0 | G0 | Xcode project | A written verdict in the team channel on whether motion samples and timers keep arriving while locked | Not started (J2) |
| C2 | Info.plist usage strings for mic, motion and location; URL scheme `raveguard://` | SES-1 | P0 | G0 | Xcode project | A cold install asks for each permission, with no crash | Done (K1), in the Expo `app.json` |
| C3 | Ship `FakeNoiseController` and `PreviewSessionModel` with one static state per screen | — | P0 | G0 | Contracts | D renders every screen from previews | Done (K2): the native module's fakes replace these |
| C4 | `SessionManager` state machine over SessionPhase: pure logic, injected clock, one unit test per transition | SES-3, SES-4 | P0 | G1 | Contracts | Tests cover nod, tap, safe PIN, duress PIN, wrong PIN ×3 and timeout | Done (J8) |
| C5 | Check-in scheduler (30/60 min, or manual in demo) plus trigger intake from MotionEventSource | SES-2 | P0 | G1 | C4, A2 | A FakeMotionSource trigger starts a check-in | Done (J9) |
| C6 | Escalation wiring: register when a check-in starts (deadline = sum of stage windows), PATCH facts each stage, cancel on nod/tap/PIN, fireNow after 3 wrong PINs, poll status while escalated, go to SOS when the server says so | ESC-1, ESC-7 | P0 | G1 | C4, B3 | The full ladder runs against FakeEscalationService | Done (J10), against Andy's `FakeEscalationService` |
| C7 | `VoicePrompter`: quiet whisper "Nod if you're okay", then louder "Are you okay? Nod, or tap Cancel" with haptics | HRG-6 | P0 | G1 | C8 | Heard in the AirPods, not on the speaker | Implemented (M6) and tested in code; physical AirPods routing, volume and locked-screen validation pending |
| C8 | Audio session: `.playAndRecord`, preferred input the built-in mic, `.allowBluetoothA2DP` and never `.allowBluetooth` (avoids HFP and the AirPods mic) | HRG-6 | P0 | G1 | None | The mic keeps metering while a prompt plays at full quality | Implemented (M5); physical AirPods route and mic-continuity validation pending |
| C9 | Location: one fix when a check-in starts, updates only while escalated, none otherwise | PRV-2 | P0 | G2 | C6 | Network log shows no location outside a check-in | Not started (AN10) |
| C10 | Demo mode: SessionConfig demo timings; SOS calls the teammate number from config; a test asserts no emergency number exists in the code | DEM-1 | P0 | G1 | C4 | Demo ladder runs in about 95 s; grep finds no emergency number | Done (J11) |
| C11 | Swap fakes for the real ones: A's `HeadMotionStream` and B's `ServerClient` | — | P0 | G2 | A7, B12 | Scenarios 1, 2 and 5 pass on the real stack | In progress (J12): real motion, `ServerClient` and voice behind the module; waiting on B1, A11 and physical voice validation |
| C12 | AirPods disconnect: log, banner, on-screen check-ins with haptics only | SES-7 | P1 | G3 | C11 | Taking the AirPods out mid-session doesn't escalate | In progress (BL2): AirPods connected and disconnected dialogs; no on-screen check-in fallback yet |
| C13 | `LevelMeter`: RMS → dB once per second, with a calibration offset set against a phone SPL meter app | HRG-1 | P1 | G2 | C8 | Within 5 dB of the reference app at 70 and 95 dB | Implemented (BL1); calibration on a phone pending |
| C14 | `DoseTracker`: 85 dB / 8 h, 3 dB exchange rate, using in-ear level = room dB minus attenuation | HRG-2 | P1 | G2 | C13 | Unit test: 94 dB for 1 h gives 100% | Done (BL1) |
| C15 | Level loop: easing 0.2, deadband 2, a floor that rises with dose | HRG-3 | P1 | G2 | C14 | Plays back a recorded dB trace with no jumps over 10 per second | Done (BL1) |
| C16 | `ShortcutsController`: `RG Adaptive` and `RG Noise Cancellation` on the demo phone, x-callback URL back to `raveguard://`, 25 s dwell; manual slider input | HRG-4, HRG-5 | P1 | G3 | C8 | Mode switches with the app in the foreground and returns to it; slider works regardless | Implemented (M4); a fix for switches looping between the app and Shortcuts is in progress |

Shortcut URL: `shortcuts://x-callback-url/run-shortcut?name=RG%20Adaptive&x-success=raveguard://`. On screen, it flashes to the Shortcuts app and back. Say so in the demo rather than hide it.

## Track D tasks: interface, settings and debug panel

Track D builds every screen against `PreviewSessionModel` from Saturday morning, so the UI never waits on real sensors. D also owns the duress screen, the hardest UI requirement in the project.

| ID | Task | Req | Pri | Gate | Depends on | Done when | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | Create the Xcode project: iOS 17, synchronized folders, the folder skeleton from Ways of working; push to GitHub | — | P0 | G0 | None | All 4 people build and run on a physical iPhone | Done (K1): an Expo app replaces the Xcode project |
| D2 | Ship `FakePINVerifier` (1111 safe, 9999 duress) | ESC-7 | P0 | G0 | Contracts | Merged; C uses it in tests | Superseded by D6's real PIN gate (K6) |
| D3 | Navigation shell with all 6 screens skeletal, driven by PreviewSessionModel | UI-1–6 | P0 | G1 | C3 | Every screen reachable and previewable | Done (K3); 14 redesigned screens |
| D4 | `ContactStore`, `PermissionModel`, `SessionConfig`: Codable, saved to a file; Contact 1, Contact 2, venue staff | UI-1, PRV-3 | P0 | G1 | Contracts | Settings survive a relaunch | Done (K4); adds the meeting spot |
| D5 | Setup flow: recipients and their order, permissions grid, interval, loudness target, both PINs (must differ), self-description | UI-1 | P0 | G1 | D4 | Scenario 7's setup is done in under 60 s | Done (K5) as a four-step setup; 60 s timing not yet measured |
| D6 | `PINGate`: verify returns safe, duress or wrong; counts wrong attempts; salted hashes in Keychain | ESC-7, PRV-4 | P0 | G1 | D2 | Unit tests for all three results and the 3-strike rule | Done (K6), in `expo-secure-store` |
| D7 | PIN entry and cancel confirmation: one code path for safe and duress, a fixed 600 ms "Cancelling…", the same haptic, the same "Cancelled. Stay safe." screen | UI-4 | P0 | G2 | D6 | Side-by-side screen recordings of both PINs match frame for frame | Done (K9); side-by-side phone recording pending |
| D8 | Check-in screen: countdown ring, "Are you okay?", Cancel ≥ 60 pt | UI-3 | P0 | G1 | D3 | Usable one-handed in the dark | Done (K7) |
| D9 | Active session screen: room dB, protection level, dose, motion state, next check-in, Stop | UI-2 | P0 | G1 | D3 | Values update live once C11 lands | Done (K8), with Automatic / Manual protection |
| D10 | Alert screen: who was texted, ack status, Call button (teammate in demo) | UI-5 | P0 | G2 | D3 | Ack on Contact 1's page shows here within 5 s | Done (K10), plus the SOS screen; real ack waits on B1 and B2 |
| D11 | Debug panel + `ScenarioSimulator`: one button per scenario, live motion readouts (A13), demo/real toggle, "simulate offline" as a backup for real airplane mode | UI-6, DEM-2 | P0 | G2 | D3, A13 | Each of the 7 buttons fires its scenario | Done (K11) |
| D12 | Accessibility pass: Dynamic Type, VoiceOver labels, contrast on Check-in and PIN screens | UI-7 | P1 | G3 | D7, D8 | VoiceOver reads Check-in in a sensible order | Partly done (BL8); a VoiceOver pass on a phone is pending |

The duress rule spans C and D. After a duress cancel, `SessionManager` shows `.monitoring` and keeps tracking the escalation silently. Polling never opens the Alert screen, and the visible log shows a plain "Checked in". The only place the duress record exists is the on-device JSON log.

## Demo and pitch: all four, after the code freeze

Nobody owns the demo or the pitch alone. Once main is frozen at 05:00 Sunday, all four build them together, and each person presents the part they built.

| ID | Task | When (Sun) | Done when | Status |
| --- | --- | --- | --- | --- |
| T1 | Demo script: scenario order, who holds which phone, a fallback per scenario | 05:00–05:30 | All four have read it through once | Not started |
| T2 | Slides: each person writes their own slides from the table below, then one pass together for flow | 05:00–06:00 | One deck, including the Real vs simulated slide | Not started |
| T3 | Rehearsal 1 on the real stack; fix the script and slides | 06:00–06:45 | All 7 scenarios run in order without stopping | Not started |
| T4 | Rehearsal 2, screen-recorded as the backup video | 06:45–07:30 | Video saved locally and uploaded | Not started |
| T5 | Submission: write-up, video, repo link, team | 07:30–08:30 | Submitted by 08:30, 30 min before the deadline | Not started |

| Member | Presents | Live on stage |
| --- | --- | --- |
| A | Why the signal is impact then stillness, how falls and nods are detected, the measured nod and false-alarm rates (A14) | Scenarios 1 and 2 |
| B | The server-owned clock, the SMS chain, per-contact privacy | Scenarios 4, 5 and 7 |
| C | The check-in ladder, voice prompts, hearing protection and dose | Scenario 6 |
| D | The screens, the duress path, the Real vs simulated slide | Scenario 3 |

Pick who opens and who closes at 05:00. The raw material comes out of the build with no extra work: A14's rates, B's SMS timing log and D7's side-by-side recordings.

## Timeline and gates

Four checkpoints carry the build to a 05:00 code freeze, which leaves four hours for all four to script, rehearse, record and submit the demo together before 09:00 Sunday. The timeline assumes a 19:00 Friday start; if the start differs, shift the first bar, not the gates.

*Diagram: hackathon timeline with 7 phases and 6 gates. The gate table below has the same times. See the live doc.*

At each gate the team checks the list below. Anything missing goes to the cut list, not to later in the night.

| Gate | When | Must exist | Cut if behind |
| --- | --- | --- | --- |
| G0 | Fri 23:59 | Project builds on 4 iPhones; Pro 3 pitch prints (A1); background verdict (C1); server live on HTTPS; test SMS on every demo phone; contracts and all fakes merged | Nothing; fix it before sleeping |
| G1 | Sat 13:00 | Motion data recorded and replaying in tests; ladder running against fakes; register → SMS working with curl; ServerClient merged; screens skeletal; setup and PINs working | Level loop and dose |
| G2 | Sat 20:00 | Real fall and nod detection; fakes swapped for real (C11); contact page ack and resolve; duress screen; Debug panel; scenarios 1, 2 and 5 pass on the real stack | LLM polish, venue staff wide view |
| G3 | Sun 03:00 | All 7 scenarios pass; measured nod and false-alarm rates | Hearing drops to the slider; stillness trigger |
| Freeze | Sun 05:00 | Main tagged `demo`; no server redeploys from here on | — |
| Submit | Sun 08:30 | Two rehearsals done; backup video recorded; submission sent, 30 min before the 09:00 deadline | — |

## Ways of working

Main builds at all times, each track stays inside its own folders, and integration means flipping a flag, not merging a big branch.

```text
repo/
├── app/                       Expo React Native app, TypeScript             (D)
│   ├── src/                   Screens, UI kit, settings, PIN gate, Debug    (D)
│   └── modules/raveguard-native/ios/   Swift native module
│       ├── Shared/            Contracts.swift                         (everyone, by agreement)
│       ├── Module/            Runtime that wires real or fake pieces together
│       ├── Motion/            HeadMotionStream, FallDetector, NodDetector, Fixtures/   (A)
│       ├── Session/           SessionManager (C) · SessionLog, BriefFactsBuilder (A)
│       ├── Escalation/        ServerClient, FakeEscalationService           (B)
│       ├── Hearing/ Audio/ Noise/ Voice/   Level, dose, ShortcutsController, VoicePrompter (C)
│       └── Tests/             Swift tests, one folder per area
├── server/                    Express app, engine, sms, brief, public/      (B)
└── docs/                      Design mockups, handoffs, fall-model plan
```

- **Native project.** `app/ios/` is generated by `npx expo prebuild` and ignored by Git; nobody edits it by hand. Usage strings, background modes and the URL scheme live in `app/app.config.ts`, which Kean owns.
- **Toolchain.** Expo SDK 57, so teammates on Xcode 26 and 27 can both build. Build to a phone with `npm run ios:device` from `app/`.
- **Signing.** Free personal teams. Each person sets their own `RG_BUNDLE_SUFFIX` (and optionally `RG_APPLE_TEAM_ID`) in a git-ignored `app/.env.local`, so builds never fight over signing.
- **Branches.** Short-lived `kean/…`, `moses/…`, `justin/…`, `andy/…` branches off main, merged often. Never merge red.
- **Fakes to real.** The module's runtime picks fake or real for each piece. The real `SessionManager` and, on iOS, the real `HeadMotionStream` always run; `ServerClient` replaces `FakeEscalationService` when the build sets `RG_SERVER_URL`. Leaving it empty is the on-stage fallback.
- **Secrets.** Twilio SID, auth token and the Anthropic key live only in the host's environment variables. `server/.env` is git-ignored, and `.env.example` is committed. No keys in the app.
- **Contract changes.** Post in the team channel prefixed `CONTRACT:`; merge only after every affected track says yes.
- **Gate check-ins.** 10 minutes at each gate: what's done, what's blocked, what's next, and what gets cut. Agree on a sleep rota at G2 so at least two people are awake at any hour.

## Testing and verification

The logic that decides whether help gets called gets automated tests; everything else gets verified on a device at a gate. Write the state-machine and engine tests before the code they cover, because those are where a bug turns into a missed alert.

| Track | Automated | On device, at the gate | Bar |
| --- | --- | --- | --- |
| A | XCTest replay of the recorded CSVs through FallDetector and NodDetector; BriefFactsBuilder on a canned log; leave-one-person-out replay of thresholds, retuned thresholds and the fall model (A21) | Live nods and falls with music at venue volume; 10 min of dancing per person; couch falls and sit-downs on the demo couch (A23) | The success metrics table; the A21 bars |
| B | vitest with fake timers: one engine test per scenario, the permission filter, the brief renderer, token auth | curl smoke script against the hosted server; real SMS to all 4 phones | Every P0 endpoint covered; scenario 4 passes with the phone in airplane mode |
| C | XCTest on SessionManager: every transition, using FakeEscalationService and an injected clock; DoseTracker maths | Locked-screen run (C1); prompts audible in the AirPods; Shortcuts round trip | No untested transition in SessionPhase |
| D | PINGate unit tests; snapshot test that safe and duress produce the same view tree | Side-by-side recording of both PINs; setup finished from scratch in under 60 s | Duress indistinguishable; all 7 Debug buttons work |

End-to-end runs happen at G2 (scenarios 1, 2, 5) and G3 (all 7). Each run goes in a log of date, scenario, pass or fail, and note. Every false alarm is counted, because a measured rate is what goes on the slide.

## Risks and cut list

The biggest risks get answered on Friday night (A1, C1, B2), so by Saturday morning the plan rests on facts. Each risk below already has its fallback.

| Risk | Likelihood | Hits | Fallback | Owner |
| --- | --- | --- | --- | --- |
| Pro 3 head motion doesn't stream | Resolved | Everything | A1 passed: motion streams on a Mac and live in the app on a phone | A |
| App suspended when the screen locks | High | Scenarios 1, 2 | C1 decides it; otherwise stay foregrounded with the idle timer off. The server countdown covers the rest; say so on stage | C |
| Host sleeps or a redeploy wipes the store | Medium | Scenario 4 | Always-on plan, snapshot store (B17), no deploys after the freeze | B |
| Twilio trial limits: verified numbers only, "trial account" prefix | High | Scenarios 2, 5, 7 | Verify all demo phones Friday; $20 upgrade removes the prefix if wanted | B |
| Nod unreliable with music at volume | Medium | Scenarios 1, 6 | Tap Cancel is an equal path and always on screen | A |
| Fall detector fires while dancing | Medium | Alert fatigue, reliability score | Lengthen the stillness window; lean on scheduled check-ins; state the measured rate | A |
| Couch falls land under the 2.5 g spike, so the demo fall isn't detected | High | Scenarios 2, 5, 7 | A15 measures it first; retuned thresholds (A18); the model (A20); Debug scenario 2 still fires a fall | A |
| The fall model overfits four people's couch falls | Medium | False alarms or misses | Leave-one-person-out bars (A21); it ships only if it beats retuned thresholds; thresholds stay as the fallback | A |
| Couch-tuned detection misses real falls on a hard floor | Medium | Credibility | Say on stage that it was tuned and shown on a couch; hard-floor recordings come after the hackathon | A |
| Tiger Data credits expire (30 days) or the service is down | Low | Dataset sharing only | CSVs stay in `Motion/Fixtures/` as the source of truth; training reads exported CSVs | A |
| Wearer cancels while offline, so the server fires anyway | Medium | False alarm | Cancel retried until it lands; late cancel sends an all-clear (B14) | B |
| Venue Wi-Fi congested or captive | Medium | Live demo | Wearer phone on cellular; server off-site | B |
| LLM slow or down | Low | Brief wording only | Template brief after 3 s | B |
| Shortcuts round trip fails or looks janky | High: seen on a phone, where automatic protection can loop between the app and Shortcuts; a fix is in progress | Hearing demo | Manual slider (HRG-5); the Off backend in Debug | C |
| Integration slips past G2 | Medium | Every scenario | Fakes stay switchable per protocol; cut from the list below | All |
| AirPods flat after a day of testing | Medium | Device testing | Charge at every gate; borrow a second pair of AirPods Pro or Max for motion work | A |

**Cut list**, in order. Cut the first item before touching the second.

1. SMS reply "OK" to acknowledge (WEB-6)
2. Learned fall model and the Tiger Data dataset (DET-8, A17, A19–A22); the retuned thresholds stay
3. LLM polish of the brief (BRF-3); the template stays
4. Lost-contact watchdog (ESC-5)
5. Venue staff wide view (WEB-4); staff still get SMS and the standard page
6. Shortcuts backend (HRG-4); the manual slider stays
7. Level loop and dose (HRG-1–3); a static dose estimate stays on screen
8. Stillness trigger and motion state (DET-3, DET-5)
9. Accessibility pass (UI-7)

Never cut: the server countdown, the recipient chain, Tap Cancel, the duress path, or the permission filter. Those carry scenarios 2 to 7.

## Open questions

None of these blocks Friday night's work, but each needs an answer by the gate shown.

- [x] **Owners.** Settled in the work order: Kean, Moses, Justin and Andy, by task.
- [ ] **App name.** "RaveGuard" is a placeholder and appears on every slide and SMS. Decide by G2.
- [ ] **Host.** Railway or Fly, and whose account? An always-on plan is needed either way. Still open, and B1, B2 and every real-stack scenario wait on it.
- [ ] **Twilio.** Keep the trial with its "trial account" prefix, or pay $20 to remove it? Decide by G1.
- [ ] **Anthropic API key.** Who provides it for B15? Decide by G2. If no one does, the brief stays template-only.
- [ ] **Venue staff device.** A fourth phone for the staff SMS, or route it to Contact 2's phone and show the page on the laptop? Decide by G2.
- [ ] **Recording consent.** Does everyone agree to their head-motion recordings (no audio, no location) being stored in Tiger Data until the hackathon ends? Decide before A17.
- [ ] **Tiger Data for the server.** Should Andy's escalation store (B17, ESC-6) use the same hosted PostgreSQL instead of a JSON snapshot? Andy decides by G2.
- [x] **Location precision.** Yes: setup has a free-text meeting spot (up to 120 characters), sent to the native module. It does not reach the server's brief yet.
