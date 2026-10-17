# Andy's work-order implementation

Source: WORK_ORDER.md, rechecked against a60976f for AN5. This supersedes the earlier unnamed A–D assignment: **Andy owns escalation; Justin owns motion/session; Kean owns Expo/screens; Moses owns Shortcuts/audio.** Demo and pitch remain whole-team work.

The prior `c/check-in-ladder` branch is preserved for Justin to review or reuse. It is not merged here, and its old Track C ownership text is superseded by this work order. This branch touches no session controller, screens, audio or bridge implementation.

## Scope and status

| Task | Delivered | Remaining acceptance |
| --- | --- | --- |
| AN1 | Runnable Express `/health`, lockfile, Dockerfile, HTTP test | Choose hosting account/project, deploy, verify HTTPS from cellular |
| AN2 | FakeEscalationService matching the PRD protocol, demo/real deadline chain, recipient debug hooks and tests | Justin integrates it with his session/native module |
| AN3 | No action taken | Hosting/Twilio configuration and consented demo recipient details required |
| AN4 | Session creation, hashed bearer tokens, heartbeat, deletion, Zod validation, HTTP tests and curl smoke script | Hosted verification after AN1 |
| AN5 | Server-owned sweep, routes, ordered windows, safe/duress, SOS, internal ack/resolve, fake-clock and HTTP tests, simulated-delivery curl smoke | Real-SMS acceptance after AN1/AN3/AN6; no contact pages or restart recovery yet |
| AN6 | Four bounded SMS templates, safe-retry sender, deduplication and Twilio adapter tested with fake transport | AN3 setup, async engine integration, recipient URL/permission wiring and real-phone delivery acceptance |
| AN7 | `Escalation/ServerClient.swift`: the `EscalationService` over HTTPS with the session bearer token, its own 10 s heartbeat, and a cancel that retries until the server accepts it; 25 injected-transport tests plus a live smoke against the real server | Justin's swap (J12), hosted run after AN1, airplane-mode and locked-phone checks on a device |
| AN8 | `server/src/brief.js`: `payloadFor(recipient, escalation)`, the single permission filter for SMS and the page, plus the full and reduced brief text; `engine.view(escalationId, recipientId)`; SMS templates now consume the payload; briefs and SMS use the wearer's local time (`utcOffsetMinutes`, sent by `ServerClient`) | AN11 consumes `engine.view` for the page and its duress variant; real-phone side-by-side check |
| AN11 | Contact page at `/a/:token` (`server/src/contact-page.js`, `server/public/`): Acknowledge, two-tap Mark resolved, 3 s polling, map link, duress variant (banner, neutral title, no call); per-recipient link tokens that resolve only once notified; `npm run demo:contact` | Real-phone ack/resolve reaching the wearer's Alert screen; needs SMS delivery (AN3) and hosting (AN1) |

Plan: test health endpoint and offline fake first; implement them; review; push a dedicated feature branch. Work-order and PRD task-status snapshots are not edited to claim deployment or team integration.

## Justin's offline integration

The work order relocates Swift sources under `app/modules/raveguard-native/ios/`. `Shared/Contracts.swift` preserves Justin’s merged contracts, including concurrency conformances and removal of the superseded SessionModel, with a corrected privacy comment. Shared-contract review remains an all-owner handoff. Kean can keep these files when creating his native module rather than generating duplicate types.

Inside that same Swift module:

```swift
let service: any EscalationService = FakeEscalationService()
try await service.startSession(
    wearerName: settings.wearerName,
    selfDescription: settings.selfDescription,
    recipients: settings.recipients,
    demo: settings.demo
)
let escalationID = try await service.register(deadline: deadline, facts: facts)
let status = try await service.status(escalationID)
```

`settings`, `deadline` and `facts` above come from Justin's existing configuration/facts wiring; the snippet does not define new shared types. Production construction remains fake until AN7 lands. The actor serializes its mutations. Root Package.swift is a test harness, not a second app or an Expo module definition; the Expo module compiles these source files directly.

### Time and recipient behavior

- `register` honors the supplied deadline. Use now + 35 seconds for demo or +70 for real. It returns a new local escalation ID.
- Primary, backup, staff are sorted by Contact.order, skipping receiveAlerts=false. Each receives 20 seconds in demo or 120 in real. With three recipients, SOS opens at 95/430 seconds from check-in start.
- The fake advances lazily on calls (including status/heartbeat), using elapsed time projected onto the initial wall-clock date. It has no background task, socket, notification or persistent store. Polling catches up all elapsed windows; recorded notification times are **simulated scheduled times**, not actual sends. This is sufficient for the protocol's polled offline UI, not proof of real background delivery.
- With zero consenting recipients, deadline expiry exposes sosOpen without pretending anyone was notified.
- Safe cancellation before notification is cancelled; after notification it resolves the fake record. Duress fires a pending record immediately. Duplicate cancel/fire/ack calls do not restart the chain. No all-clear SMS exists in this fake.
- The fake does not annotate a brief as duress or emit JS events. Justin must suppress all wearer-facing escalation presentation after duress, as the work order requires. Real brief/duress rendering is AN6/AN8/AN11.
- For Debug, retain the concrete FakeEscalationService reference and call `acknowledge(id, recipientID:)` or `resolve(id, recipientID:)`. They reject unnotified recipients; resolve enforces canResolve. These simulate contact-page actions without contacting anyone.
- Call endSession to clear all state. It sends nothing. This fake does not implement auth, retries, idempotent registration, restart recovery or contact payload privacy filtering; those belong to the real backend/client tasks.

## Using `ServerClient` (AN7)

```swift
let service: any EscalationService = try ServerClient(baseURL: URL(string: "https://<host>")!)
```

That one line replaces `FakeEscalationService()` in `RaveGuardRuntime.withFakes`. The initializer throws `ServerClientError.insecureURL` for anything but HTTPS (loopback may use HTTP), because the bearer token travels on every call. The server URL is not decided yet: it comes from the AN1 deployment, so Justin or Kean will need to pass it in from app config.

- **Heartbeat.** The client sends its own beat every 10 s from `startSession` until `endSession`. `SessionManager` also calls `heartbeat()` every 10 s; the client skips a beat sent within the last 5 s, so the two sources never double up. A failed beat is not retried early; a 401 or 404 stops the loop.
- **Cancel.** `cancel` returns when the server has accepted it. Network errors, 429 and 5xx retry at 0.5 s, 1 s, 2 s, 4 s, then every 5 s, with no limit, until it lands or the session ends (`endSession` makes a waiting caller throw). 400, 401 and 404 throw at once. A duress call upgrades a safe cancel that is still retrying, and a safe cancel is skipped once a duress one has landed, because a late safe cancel would close the escalation the duress just fired.
- **Everything else is one attempt** and throws a `ServerClientError`; `SessionManager` owns those retries. `endSession` is the exception: it retries the DELETE up to 3 times, since a record left on the server would outlive Stop.
- **`register` is idempotent.** `SessionManager` retries a failed register with the same deadline and facts and cannot tell whether the first attempt landed. The client sends an `Idempotency-Key` derived from the session, the deadline and the trigger (kind and time), so a retry gets the original escalation back (HTTP 200 instead of 201) instead of creating a second one the phone never learns the id of. The server keeps the key on the escalation record: keys are per session, a replay does not count against capacity, a replay after cancel returns the closed escalation without reopening it, and the same key with a different deadline is a 409 `IDEMPOTENCY_MISMATCH`. Requests without the header behave as before. The derived key assumes two real check-ins never share a deadline and trigger time to the millisecond.
- **Not logged:** the client writes no logs. Error descriptions carry only a status or the server's fixed error code, never the token, a phone number or a body.

## Brief privacy (AN8)

`payloadFor(recipient, view)` in `server/src/brief.js` is the only code that reads a recipient's permissions or an escalation's facts for outbound use. It builds the result field by field, so a new `BriefFacts` field reaches no recipient until it is added there on purpose. The four toggles are independent: `seeFullBrief` chooses the full or reduced brief, `seeLocation` adds the coordinates and map link (only if the phone sent a fix), `canResolve` is passed through for the page's button, and `receiveAlerts=false` returns null. Venue staff follow the same rules; the PRD's "location always shown" for staff (B13) is satisfied by defaulting staff to `seeLocation: true` in setup, not by an exception in the filter. Raise it if staff should bypass the toggle.

"Phone went silent at HH:MM" appears in the full brief when the last heartbeat was more than 20 s before the read. Times are local: `ServerClient` sends `utcOffsetMinutes` at session start (older clients that omit it get "HH:MM UTC"). The offset is fixed for the session, so a session that crosses a daylight-saving change shows the start-of-session offset.

## Tests

With full Xcode selected: `swift test`. With Swift command-line tools alone: `python3 scripts/check_escalation_fake.py`. The latter compiles and executes the same test methods with a limited assertion runner; it is not XCTest. GitHub's macOS job runs XCTest. Server: `npm test --prefix server`. `bash scripts/smoke-server-client.sh` builds the real `ServerClient` and runs it against a local server (or `https://<host>` once AN1 is deployed).

The cases cover demo deadlines, real ack windows with infrequent polls, pre-deadline cancel, duress, acknowledgment, late cancel, fire idempotency, opt-outs, resolution permission, unknown IDs, session deletion and no recipients. They do not validate radio connectivity, actual SMS, user-facing duress concealment or the seven real-stack scenarios.

## Repository workflow

Push each feature branch for teammates to pull/review. GitHub write permission enables contributing; a PR is a proposed merge and discussion, not a prerequisite to committing or pushing a feature branch. The team has authorized feature branches followed by tested merges to main. Do not overwrite main or another person's branch to make an integration faster.

## Next step requiring account context

Select the Railway or Fly account/project for AN1. Deploy the server and verify its public URL. AN3 additionally needs Twilio configured and actual consenting test recipients; no phone numbers or secrets should be committed. The current branch does not claim either external step is complete.
