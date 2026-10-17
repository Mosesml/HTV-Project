# Track C: check-in ladder

Andy owns Track C; Justin owns Track B. Moses is researching LibrePods; Kean is preparing the work order. Demo and pitch are whole-team work per PRD revision 8875b95. Those facts do not assign Moses/Kean to A/D.

## First feature scope

Implement the deterministic core of C4 as `CheckInLadder`, a single-use state machine for one check-in. Injected wall and elapsed clocks make it testable without a phone, server, timers or sleeping. It emits typed actions for the future SessionManager adapter: register a deadline, play/stop prompts, cancel, fire immediately, or fetch server status. No action is executed by this library.

Use the PRD's 20/20/30-second real ladder and 10/10/15-second demo ladder. Nod/tap cancels only during either prompt. PIN is accepted only at the gate; the third wrong PIN requests immediate escalation. Safe/duress PIN both produce the same visible cancelled phase, but different backend actions. All later server updates remain suppressed in the duress presentation. Local timeout means awaiting server confirmation, not proof that anyone was contacted.

One instance represents exactly one check-in ID; do not reuse it or route another check-in's responses to it. SessionManager will own the wider session, scheduler, persistence, log, network retries and mapping of local check-in IDs to B's server IDs. This branch does not change the shared PRD interfaces or implement Justin's server/client.

## Implementation plan

1. Add the Swift package and tests for timing, cancellation, PIN, delayed ticks and remote status behavior. Run them before implementing behavior.
2. Implement the clock-driven core under C's Session folder. Keep networking/audio/credentials out of the core.
3. Run the entire Swift suite; review edge cases, then commit and push the feature branch `c/check-in-ladder`.

## Verification boundary

Swift package tests run on a Mac without an iOS project. Xcode/device tests, audio routing, background execution, Core Motion, Shortcuts/LibrePods, hearing measurements and SMS remain unverified and outside this first feature.

## Justin / Track B handoff

The adapter must execute the returned actions. Local UUIDs identify check-ins, not server escalation IDs:

| Core action | Adapter responsibility |
| --- | --- |
| register(checkInID, deadline) | Build BriefFacts using A's builder; call EscalationService.register; retain UUID → server ID mapping. Retry using the same operation identity so a lost response cannot create duplicates. |
| cancel(checkInID, mode) | Stop local prompts immediately; queue safe/duress cancellation until the server ID is available and retry until acknowledged. Never claim remote cancellation merely because the local screen closed. |
| fireNow(checkInID) | Queue until registration completes, then call fireNow exactly once per logical action with safe retries. |
| fetchStatus(checkInID) | Fetch status once the server ID is known; continue normal polling outside this core, including hidden duress flows. |
| prompt(stage) / stopPrompts | C's audio/haptic adapter; no audio work happens here. |

If registration fails, the adapter must surface remote protection as unavailable. The PRD's current registration method returns only a server ID; agreed deadline/clock reconciliation remains a B/C integration decision. The core uses elapsed time from ContinuousClock by default (independently injectable for tests) and does not invent an accepted server deadline.

Call `receive` with status only for this instance's check-in. Serialize events (the future SwiftUI adapter should own it on MainActor), and prevent overlapping status requests or attach versions; remote statuses here have no revision number. Do not wire cancelled/resolved states from another check-in to this instance. Raw PIN strings never enter the core: D's PINVerifier supplies safe, duress or wrong.

The visible phase `.cancelled` represents local dismissal for both safe and duress; it is not evidence of backend cancellation. Do not expose Action values, PIN results, network errors containing duress, or request logs in wearer-facing UI. The network adapter still owns retry/persistence and discretion across app relaunches; this core does not establish full duress concealment.

## Using the package

Run `swift test` from the repository root on a Mac with the Swift toolchain. The package has no third-party dependencies. The future Xcode app can add this local package and import RaveGuardSession; do not also compile the same Session source files directly into its app target.

Create one CheckInLadder per check-in; consume `start()` actions once, call `tick()` from a timer while active, and pass nod, tap and verified PIN events to its methods. Wall time is used only for the registration timestamp. ContinuousClock drives durations, including across sleep; both clocks are injectable for deterministic tests. Use secondsRemaining for countdown UI rather than subtracting Date() from the stage timestamp. Voice prompts are emitted only for the current stage if ticks arrive late. Server status, not elapsed local time, opens escalation/SOS UI. Use A's MotionEventSource only as a trigger; scheduling and the overall session lifecycle remain for SessionManager.

## Remaining Track C work

- SessionManager implementing the PRD SessionModel, scheduled/motion triggers, persistent queued network actions, and preview states.
- C1/C2 device/background capability spike and permission configuration with the app-target owner.
- Justin's EscalationService integration, status polling, heartbeat, update facts and session teardown.
- Voice prompts, microphone/input-output routing, permission-aware location updates and disconnect fallback.
- Hearing-awareness calculations after the safety slice works; coordinate with Moses before adding any noise-control adapter.

No new work is assigned to Justin or other teammates by this branch; it documents the integration boundary for their review.

## Checks for this branch

The standalone runner compiles the same synchronous test methods and assertions as the XCTest suite. It is intentionally limited and rejects unsupported lifecycle hooks/signatures. This Mac's `swift test` cannot run because XCTest is absent; GitHub CI runs the real suite on a macOS runner with Xcode. A passing standalone run is not an XCTest or physical-device pass.
