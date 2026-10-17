# Andy's work-order implementation

Source: WORK_ORDER.md at commit 5f6c2fc. This supersedes the earlier unnamed A–D assignment: **Andy owns escalation; Justin owns motion/session; Kean owns Expo/screens; Moses owns bridge/audio.** Demo and pitch remain whole-team work.

The prior `c/check-in-ladder` branch is preserved for Justin to review or reuse. It is not merged here, and its old Track C ownership text is superseded by this work order. This branch touches no session controller, screens, audio or bridge implementation.

## Scope and status

| Task | Delivered | Remaining acceptance |
| --- | --- | --- |
| AN1 | Runnable Express `/health`, lockfile, Dockerfile, HTTP test | Choose hosting account/project, deploy, verify HTTPS from cellular |
| AN2 | FakeEscalationService matching the PRD protocol, demo/real deadline chain, recipient debug hooks and tests | Justin integrates it with his session/native module |
| AN3 | No action taken | Hosting/Twilio configuration and consented demo recipient details required |

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

## Tests

With full Xcode selected: `swift test`. With Swift command-line tools alone: `python3 scripts/check_escalation_fake.py`. The latter compiles and executes the same test methods with a limited assertion runner; it is not XCTest. GitHub's macOS job runs XCTest. Server: `npm test --prefix server`.

The cases cover demo deadlines, real ack windows with infrequent polls, pre-deadline cancel, duress, acknowledgment, late cancel, fire idempotency, opt-outs, resolution permission, unknown IDs, session deletion and no recipients. They do not validate radio connectivity, actual SMS, user-facing duress concealment or the seven real-stack scenarios.

## Repository workflow

Push each feature branch for teammates to pull/review. GitHub write permission enables contributing; a PR is a proposed merge and discussion, not a prerequisite to committing or pushing a feature branch. The PRD's teammate review convention still applies. Do not overwrite main or another person's branch to make an integration faster.

## Next step requiring account context

Select the Railway or Fly account/project for AN1. Deploy the health-only server and verify its public URL. AN3 additionally needs Twilio configured and actual consenting test recipients; no phone numbers or secrets should be committed. The current branch does not claim either external step is complete.
