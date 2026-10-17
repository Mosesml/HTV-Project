# Andy — escalation server (AN1 foundation, AN4, AN5 simulation)

The work order assigns Andy the server and Swift escalation client. This server implements **GET /health, the AN4 session API and the AN5 escalation engine with simulated delivery**. It does not send SMS or serve contact pages. A healthy response means the process is reachable, not that safety alerts are operational.

## Local setup

Node 22:

```sh
cd server
npm ci --ignore-scripts
npm test
npm start
```

Open `http://localhost:3000/health`. The process listens on `0.0.0.0`, uses host-provided `PORT` (default 3000), and shuts down on SIGTERM/SIGINT. `.env.example` documents PORT; the app reads process environment, not `.env` automatically.

## Deployment handoff

A Dockerfile and lockfile are included. Set the deployment build context/root directory to `server/`. On Railway, deploy this directory using the Dockerfile and generate an HTTPS domain. On Fly, configure the app to build this Dockerfile, forward to internal port 3000, and serve HTTPS. Host/account/app selection is still required; no hosting resources have been created by this branch.

```sh
# From server/; requires Docker. This image build has not been verified locally.
docker build -t raveguard-health .
docker run --rm -p 3000:3000 raveguard-health
```

Use `/health` as the platform health-check path. Once deployed, verify the HTTPS URL from a phone on cellular. **AN1 is not complete until that check passes.** No Twilio key is needed for this simulation build. A future production escalation engine needs an always-on instance and persistent storage; this simulation is not a live safety service.

## Next Andy tasks

- AN3: configure Twilio in the chosen hosting account, verify consenting demo recipients, and send the explicitly requested test SMS. No SMS has been sent.
- AN5: engine implemented with simulated delivery; real-SMS acceptance depends on AN3/AN6.
- AN6/AN8/AN11: delivery, privacy-filtered briefs and contact pages.
- AN7/AN9/AN10: real Swift client, local log/facts and location.
- AN13/AN14: restart recovery and late-cancel all-clear.

See [Andy handoff](../docs/andy-work-order-handoff.md) for the offline fake that unblocks Justin.

## Session API (AN4)

`POST /v1/sessions` accepts `{ wearerName, selfDescription, recipients, demo }` and returns HTTP 201 with `{ ok: true, data: { sessionId, token }, error: null }`. Send `Authorization: Bearer <token>` on `POST /v1/sessions/:sid/heartbeat` and `DELETE /v1/sessions/:sid`. Both return HTTP 204 with no body. Missing, incorrect, cross-session and deleted credentials return 401 with a generic JSON error. Tokens are random 256-bit values, returned only at creation and stored as hashes. Use HTTPS outside localhost.

Recipients match `Shared/Contracts.swift`: UUID `id`, `name`, E.164 `phoneE164`, `kind` (`contact` or `venueStaff`), nonnegative integer `order`, and all four boolean `permissions` (`receiveAlerts`, `seeLocation`, `seeFullBrief`, `canResolve`). Validation rejects unknown fields, duplicate IDs, names over 100 characters, descriptions over 500 characters, more than 20 recipients, and bodies over 32 KiB. Empty recipient lists are accepted to match the fake; they cannot produce contact alerts. Equal order values preserve input order for the future engine.

The heartbeat records **server receipt time**. It does not extend an escalation deadline or send lost-contact alerts (BL6). Delete removes the session and invalidates its token; repeated deletion returns 401. All `/v1` responses disable caching. JSON errors use `{ ok: false, data: null, error: { code, message } }`.

Storage is in-memory, limited to 1,000 simultaneous sessions (503 at capacity). Stop sessions to release capacity. A restart loses every session and token; use one process only until AN13 persistence lands. There are no SMS credentials or outbound notifications in this implementation.

With the server running, exercise the API using synthetic settings:

```sh
bash scripts/smoke-sessions.sh
# Once hosting exists:
bash scripts/smoke-sessions.sh https://your-host
```

The script creates a disposable session, verifies bad-token rejection, heartbeats, deletes it and checks token revocation. It never prints credentials and attempts cleanup on failure. Hosting/cellular validation is still pending.

## QA before merge

Run `npm run qa` for server tests plus the isolated curl smoke test. From the repo root, `bash scripts/qa-andy.sh` also runs the portable Swift fake suite. GitHub runs full Swift tests and deployment-image checks. See [Andy QA](../docs/andy-qa.md) for every task’s acceptance criteria and external checks.

## Escalation engine (AN5 simulation)

Verified against PRD.md and WORK_ORDER.md at `a60976f`. The work order still assigns AN5 to Andy and retains the PRD HTTP contracts and timings. The latest noise-control change is Shortcuts only; AN5 has no noise dependency and changes no shared Swift/Expo contracts.

All phone routes require the owning session bearer token:

| Route | Body | Success |
| --- | --- | --- |
| POST /v1/sessions/:sid/escalations | `{ deadline, facts }` | 201 envelope containing `escalationId` |
| PATCH /v1/escalations/:eid | `{ facts }` | 204 |
| POST /v1/escalations/:eid/cancel | `{ mode: "safe" }` or `{ mode: "duress" }` | identical empty 204 |
| POST /v1/escalations/:eid/fire | `{ reason }` | 204 |
| GET /v1/escalations/:eid | none | envelope containing exactly `state`, `recipients`, `sosOpen` |

`facts` matches the Swift BriefFacts structure. Dates are ISO 8601 strings with a timezone; Swift optional properties may be absent or null. Unknown properties/raw sensor data, invalid dates and coordinates are rejected. Invalid/foreign session credentials and unknown escalation IDs return generic 401; malformed payloads return 400; updates after closure return 409. The fire reason is validated, but does not replace the original motion-trigger facts.

The running process starts a one-second sweep independent of heartbeat and status polling. Registration accepts the phone's absolute deadline (normally +35 s demo, +70 s real). An already-expired deadline is handled on the next sweep. Recipients are sorted by order, skipping receiveAlerts=false; equal order preserves input order. Each attempted recipient gets 20 seconds in demo or 120 seconds otherwise. After the last window the SOS flag opens. A delayed sweep gives the newly attempted contact a full window from the actual attempt time; it never sends the entire overdue chain at once. This differs intentionally from the offline fake's scheduled-time catch-up behavior.

Safe cancel stops future attempts and clears SOS. It is `cancelled` before any successful simulation, otherwise `resolved`. Duress flags the record and immediately fires a pending escalation. Repeated fire/cancel cannot repeat a notification or reopen cancelled/resolved records. An already-running chain retains its window and applies the duress flag to later attempts. Late safe cancel does **not** send an all-clear yet (AN14).

`acknowledge` and `resolve` are internal engine methods, tested with notified-recipient and resolution-permission checks. They are not unauthenticated HTTP debug endpoints. Recipient tokens and contact routes/pages will be added in AN11; no `/a/*` route is delivered here. The wearer must continue suppressing escalation UI after duress, as required by the existing work order.

Delivery is a synchronous simulation callback. The process logs `simulated-notification` events with only IDs, time, duress and simulated=true; it emits no phone numbers, location or brief. Status notification timestamps mean **simulated** delivery, never a confirmed SMS. A thrown callback records a failed internal attempt, leaves notifiedAt null and advances to the next recipient after a window. Async provider delivery, one retry, actual SID accounting and shared permission-filtered payloads must be implemented under AN6/AN8 before enabling SMS. The callback must not be replaced directly with an async Twilio call.

Internal records retain facts and expose current lastHeartbeatAt to future brief rendering; heartbeat never extends the deadline. No lost-contact watchdog is included. Ending a session removes its escalations. Storage remains in-memory, single-process, and capped at 100 retained escalations per session; a new registration returns 409 at that cap. Registration is not idempotent: AN7 must not blindly retry it after an ambiguous response without adding an agreed deduplication mechanism. Restart recovery is AN13.

Run the additional curl smoke against a running simulation:

```sh
bash scripts/smoke-escalations.sh http://127.0.0.1:3000
```

It refuses a host that does not report `notificationsEnabled: false` and `stage: escalation-simulation`. It registers an expired deadline using synthetic settings, waits for the independent sweep to mark Contact 1 simulated-notified, cancels, and deletes the session. Both curl scripts run in `npm run qa` and Docker CI. **AN5's real-SMS end-to-end acceptance remains pending AN1/AN3/AN6.**
