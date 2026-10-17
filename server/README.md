# Andy — escalation server (AN1 foundation, AN4, AN5 simulation, AN8, AN11)

The work order assigns Andy the server and Swift escalation client. This server implements **GET /health, the AN4 session API and the AN5 escalation engine with simulated delivery**. It serves the AN11 contact page and, only when `SMS_MODE=live` is configured, sends real SMS. By default it simulates and sends nothing. A healthy response means the process is reachable, not that safety alerts are operational.

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

**Deployed on Railway** (see the Hosting section of the [Andy handoff](../docs/andy-work-order-handoff.md)): root directory `/server`, healthcheck `/health`, one replica, Serverless off. The steps below are the generic ones.

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
- AN6 delivery: wire the async SMS sender into the engine, using `engine.contactToken` for each recipient's link. AN8 (privacy-filtered briefs) and AN11 (contact page) are implemented.
- AN7/AN9/AN10: real Swift client, local log/facts and location.
- AN13 (restart recovery and the `/a/*` rate limit) and AN14 (the late-cancel all-clear) are implemented; see Restart recovery and Live SMS below.

See [Andy handoff](../docs/andy-work-order-handoff.md) for the offline fake that unblocks Justin.

## Live SMS (AN3 integration)

Off unless `SMS_MODE=live`. The default, and any other state of the environment, simulates: nothing is sent, `/health` says `notificationsEnabled:false`. Credentials alone never enable sending.

Live mode **refuses to start** unless all of these are set, and says which are missing without printing any value:

| Variable | Meaning |
| --- | --- |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | the Twilio account and the number that sends (E.164) |
| `PUBLIC_BASE_URL` | the plain `https://` origin recipients' links point at, e.g. the Railway domain |
| `SMS_ALLOWED_RECIPIENTS` | comma-separated E.164 numbers the server may ever text |

The allowlist exists because `POST /v1/sessions` is public and unauthenticated: without it anyone could name an arbitrary number and make this server text it. A number not on the list is never sent to; its contact is un-notified and the chain moves on. Set real values only in Railway's Variables tab, never in the repo.

When a contact's turn comes, the engine builds their AN8 payload and their `PUBLIC_BASE_URL/a/<token>` link and sends one SMS through the retry-safe sender. The contact counts as notified from the start of their turn (their link works and their acknowledgement window runs from then, so a slow provider cannot stretch the chain). A **definite rejection** (nothing was sent, for example a number Twilio has not verified) un-notifies them and the next contact goes on the next sweep instead of after a window nobody was told about; when every contact is rejected the SOS screen opens at once. An **uncertain** outcome (timeout) keeps them notified, since the message may have arrived. Logs and engine events carry metadata only: no phone, link, token, name or message text.

### All-clear after a late safe cancel (AN14)

If the wearer's safe cancel arrives **after** the alert went out, each contact who was already texted gets one follow-up: `Guardian: <name> checked in at <local time>. No action needed.` The time is the moment the server received the cancel, in the wearer's own zone (`utcOffsetMinutes`). The text carries only the name and the time: no brief, location or link.

- **Who:** only contacts whose alert is still on the record as notified. Never a contact who was not reached (including a definite rejection), an opted-out contact, or a number not on the allowlist (the same check as alerts). A cancel before any notification sends nothing.
- **Never for duress.** The server ignores a safe cancel on a duress escalation entirely: no state change, no text (this is defense in depth; the Swift client already skips it). The notifier also refuses an all-clear whose payload is a duress one.
- **Not a contact's Mark resolved.** A contact resolving from the page is not the wearer checking in and sends nothing; a wearer cancel after that is a no-op because the escalation is already closed.
- **Exactly once.** The engine closes the escalation on the first safe cancel, so duplicate, concurrent or replayed cancels do nothing more. The send also uses its own stable `deliveryId` (`<escalationId>:<recipientId>:all-clear`), so the AN6 sender's de-duplication protects it too. It uses the AN6 retry policy (one retry of a retryable rejection) and nothing new. After a cancel replayed on reconnect, the time shown is when the server first accepted the cancel.
- **Failures are contained.** A rejected, uncertain or thrown all-clear never un-notifies anyone, changes escalation state, or throws into the engine; it is logged as metadata only. A contact whose alert is still in flight when the cancel lands is told only after that alert is accounted for, and not at all if it turns out to have been rejected.
- **Hook:** the engine's `deliver` event now has `kind: 'alert' | 'all-clear'`. All-clear events carry no phone number or token, like alerts.

Tested with a fake clock and fake transport through the real notifier, sender and contact page (`test/all-clear.test.js`). **No real SMS was sent and no real phone was used** for AN14.

### Twilio trial accounts cannot send our messages

Found on 2026-10-17 by sending through the real adapter. A **trial** account is limited in two ways that matter here:

- **Predefined templates only** (Twilio error `572006`, HTTP 400: "Invalid template name. Trial accounts can only use predefined SMS templates."). Custom text, which is everything Guardian sends, is refused. The console's "Try out SMS" box works because it uses one of Twilio's canned templates.
- **Verified recipients only** (error `572002`, HTTP 422): a number that has not been verified as a caller ID is refused.

So live SMS needs an **upgraded** Twilio account (add billing; the PRD budgeted $20). Until then the server fails safe: the rejected contact is not shown as notified and the chain moves on. Failed sends log the HTTP status and Twilio's numeric code (for example `httpStatus=400 providerCode=572006`), which is how to diagnose a new failure: `railway logs` or the deployment's Deploy Logs tab.

### Contact page rate limit

`/a/*` is limited per client address (default 60 requests per minute). An open page polls every 3 seconds, about 20 requests a minute, so a few devices behind one venue Wi-Fi address share that allowance and can lock each other out. Set `CONTACT_RATE_LIMIT_PER_MINUTE` (1 to 10000; the server refuses to start on anything else) for a demo: 180 covers about nine open pages per address.

## Contact page (AN11)

Each recipient gets a link `https://<host>/a/<token>`: 128 random bits per recipient per escalation. The token is issued at registration (`engine.contactToken(escalationId, recipientId)` returns it for the SMS) but **resolves only once that recipient has been notified**, and dies with its escalation or session. Anything else (malformed, unknown, early, expired) gets the same `404 This link is not active.` on every route.

| Route | Does |
| --- | --- |
| `GET /a/:token` | the static page shell (`public/contact.html`): neutral title, no data, no inline script or style |
| `GET /a/:token/data` | JSON for the page: brief text, minutes since (server clock), map link, status, `canResolve`, `mode` |
| `POST /a/:token/ack` | 204; stops the chain; idempotent; acts only as that recipient |
| `POST /a/:token/resolve` | 204 and closes the alert for everyone; 403 without `canResolve` |

`/data` is built only from the AN8 payload, so a reduced contact never receives location or full-brief fields, and other contacts' names appear only for full-brief recipients. A duress escalation serves the same shell and adds `mode: 'duress'`: the script then shows a "Do not call or text them openly" banner and keeps the neutral tab title. No page offers a call link or number. Responses carry `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `noindex` and a CSP of `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'`. The page polls every 3 s and renders only with `textContent`.

`npm run demo:contact` starts the real server with a normal and a duress alert already fired and prints links to open in a browser (synthetic data, nothing sent). `/a/*` is rate limited (see Restart recovery and rate limit). There is no venue-staff wide layout (BL5).

## Session API (AN4)

`POST /v1/sessions` accepts `{ wearerName, selfDescription, recipients, demo }` and returns HTTP 201 with `{ ok: true, data: { sessionId, token }, error: null }`. Send `Authorization: Bearer <token>` on `POST /v1/sessions/:sid/heartbeat` and `DELETE /v1/sessions/:sid`. Both return HTTP 204 with no body. Missing, incorrect, cross-session and deleted credentials return 401 with a generic JSON error. Tokens are random 256-bit values, returned only at creation and stored as hashes. Use HTTPS outside localhost.

Recipients match `Shared/Contracts.swift`: UUID `id`, `name`, E.164 `phoneE164`, `kind` (`contact` or `venueStaff`), nonnegative integer `order`, and all four boolean `permissions` (`receiveAlerts`, `seeLocation`, `seeFullBrief`, `canResolve`). Validation rejects unknown fields, duplicate IDs, names over 100 characters, descriptions over 500 characters, more than 20 recipients, and bodies over 32 KiB. Empty recipient lists are accepted to match the fake; they cannot produce contact alerts. Equal order values preserve input order for the future engine.

The heartbeat records **server receipt time**. It does not extend an escalation deadline or send lost-contact alerts (BL6). Delete removes the session and invalidates its token; repeated deletion returns 401. All `/v1` responses disable caching. JSON errors use `{ ok: false, data: null, error: { code, message } }`.

Storage is in-memory, limited to 1,000 simultaneous sessions (503 at capacity). Stop sessions to release capacity. Without `DATA_DIR` a restart loses every session and token; set `DATA_DIR` (see Restart recovery and rate limit) to keep them, and run one process only. There are no SMS credentials or outbound notifications in this implementation.

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

Safe cancel stops future attempts and clears SOS (ignored on a duress escalation). It is `cancelled` before any successful simulation, otherwise `resolved`. Duress flags the record and immediately fires a pending escalation. Repeated fire/cancel cannot repeat a notification or reopen cancelled/resolved records. An already-running chain retains its window and applies the duress flag to later attempts. A late safe cancel sends the one-time all-clear to already-notified contacts (AN14, see Live SMS). A safe cancel on a duress escalation is ignored.

`acknowledge` and `resolve` are internal engine methods, tested with notified-recipient and resolution-permission checks. They are not unauthenticated HTTP debug endpoints. Recipient tokens and contact routes/pages will be added in AN11; no `/a/*` route is delivered here. The wearer must continue suppressing escalation UI after duress, as required by the existing work order.

Delivery is a synchronous simulation callback. The process logs `simulated-notification` events with only IDs, time, duress and simulated=true; it emits no phone numbers, location or brief. Status notification timestamps mean **simulated** delivery, never a confirmed SMS. A thrown callback records a failed internal attempt, leaves notifiedAt null and advances to the next recipient after a window. Async provider delivery, one retry, actual SID accounting and shared permission-filtered payloads must be implemented under AN6/AN8 before enabling SMS. The callback must not be replaced directly with an async Twilio call.

Internal records retain facts and expose current lastHeartbeatAt to future brief rendering; heartbeat never extends the deadline. No lost-contact watchdog is included. Ending a session removes its escalations. Storage remains in-memory, single-process, and capped at 100 retained escalations per session; a new registration returns 409 at that cap. Registration is not idempotent: AN7 must not blindly retry it after an ambiguous response without adding an agreed deduplication mechanism. Restart recovery is AN13 and is optional (`DATA_DIR`).

Run the additional curl smoke against a running simulation:

```sh
bash scripts/smoke-escalations.sh http://127.0.0.1:3000
```

It refuses a host that does not report `notificationsEnabled: false` and `stage: escalation-simulation`. It registers an expired deadline using synthetic settings, waits for the independent sweep to mark Contact 1 simulated-notified, cancels, and deletes the session. Both curl scripts run in `npm run qa` and Docker CI. **AN5's real-SMS end-to-end acceptance remains pending AN1/AN3/AN6.**

## Restart recovery and rate limit (AN13)

### Snapshot (`DATA_DIR`)

Set `DATA_DIR` to a writable directory and the server keeps `DATA_DIR/snapshot.json` (JSON, mode 0600). **Unset = persistence is off and nothing changes**: state is in memory and a restart loses it, `/health` is unchanged. On Railway, point `DATA_DIR` at a mounted volume (for example mount a volume at `/data` and set `DATA_DIR=/data`); the container runs as user `node`, so the volume must be writable by it. **Run exactly one instance**: two processes would overwrite each other's file and double-send. Also stop the old deployment before the new one starts if Railway would otherwise overlap them, since a brief overlap is the same two-writer problem.

What is saved, after every change that matters (session create/delete, escalation register/update/cancel/fire/ack/resolve, every contact turn and every send result): sessions with their settings, the SHA-256 **hashes** of their bearer tokens, heartbeat times (heartbeats are coalesced to at most one write per second); escalations with facts, absolute `deadline`/`due` timestamps, state, duress, `sosOpen`, the `next` ladder index, attempts, idempotency key, and every recipient's `notifiedAt`/`ackedAt` and **contact-link token**. Never saved: bearer tokens, the Twilio auth token or any credential. Escalation records carry no phone numbers; they are re-attached from the session settings (which already hold them) on load. Because link tokens are in the file (they must keep working from an SMS sent before the restart), treat the volume as private.

Writes are atomic: the full JSON goes to `snapshot.json.tmp` in the same directory, is fsynced, then renamed over `snapshot.json` (and the directory is fsynced, best effort). A crash leaves either the old or the new file, never half of one. A leftover `.tmp` from a crash is ignored and deleted at boot.

**On boot** the snapshot is loaded before the server listens, and the one-second sweep re-arms everything: a pending deadline fires when it is due, a deadline that passed while the server was down fires once on the first sweep, and the contact whose turn it is gets a fresh full window from the actual send time (the same no-burst rule as a delayed sweep today).

### The no-duplicate-SMS guarantee

A contact is marked notified, and the snapshot is saved **synchronously**, *before* their send starts (`EscalationEngine#advance`). So if the process dies at any point from just before the send to just after it, the snapshot already says that contact was notified, `next` has already moved past them, and after the restart the ladder continues to the next contact without texting them again. The cost is deliberate: if the process died before the SMS actually left, that one contact is never texted (they are still shown as notified and their link works), and the next contact is texted when their window runs out. A definite provider rejection is recorded too, so a rejected contact is not retried after a restart. An in-flight send whose outcome is unknown stays notified, same as before. If a save fails (disk full, volume gone), the SMS is still sent: an alert is never held back by bookkeeping, and the failure is loud (see below), so in that situation a crash before the disk recovers could lose the no-duplicate protection.

### Damaged or unusable snapshot

The server never crash-loops and never silently discards data. If `snapshot.json` is not valid JSON, is empty or truncated, has the wrong shape or version, or is internally inconsistent (duplicate or unknown ids, malformed link tokens), it is renamed to `snapshot.json.corrupt-<UTC timestamp>` (kept for inspection), the server starts **empty**, and it logs an error line `{"type":"snapshot-corrupt","level":"error",...,"action":"started with EMPTY state..."}`. If it cannot be moved aside, or exists but cannot be read, persistence is **disabled for that run** so the file is never overwritten, with `snapshot-corrupt` / `snapshot-unreadable` logged. If `DATA_DIR` cannot be created it logs `snapshot-unavailable` and runs without persistence. Failed writes log `snapshot-save-failed` (at most one line per 10 s) and `snapshot-save-recovered` when they work again. A valid snapshot that still names an escalation of an already-deleted session simply drops that escalation.

`/health` gains a `persistence` object **only when `DATA_DIR` is set** (so the unset shape is exactly the old one): `{ "snapshot": "none" | "loaded" | "corrupt-moved-aside" | "unreadable" | "unavailable", "lastSaveOk": true | false | null, "writable": true | false }`. It stays `200 ok:true` so the platform does not restart-loop; check that field (and the logs) after a deploy. It exposes no paths or counts.

### Rate limit on `/a/*`

Every `/a/*` request (valid link or not, any method) counts toward **60 per minute per client address**, a sliding window held in memory (at most 60 timestamps per client and 10,000 clients; the least recently seen client is forgotten when full). The 61st gets `429` with `Retry-After: <seconds>` and a short text/plain body in the same style and with the same security headers as a dead link, and the client recovers as old requests age out. `/contact-assets` and `/health` do not count. IPv6 clients are grouped by /64 so rotating addresses within a prefix gains nothing. The contact page polls every 3 s (about 20 requests per minute per open page), so roughly three pages open from one shared address could reach the limit.

**Client address behind Railway.** `TRUST_PROXY_HOPS` (default `1`; `0` ignores `X-Forwarded-For`) sets Express's `trust proxy` to a hop count. With N hops Express uses the Nth entry from the right of `X-Forwarded-For`, the one our own proxy appended; entries a client adds on the left are ignored, so a client can neither invent addresses to escape its limit nor impersonate someone to use up their allowance. A boolean `true` is refused because it would trust the leftmost, attacker-chosen entry. If the real number of proxies is not one, clients would share buckets (too strict) or escape them; **I have not verified Railway's header behaviour**, so after deploying, check it: from one machine send 61 requests with different invented `X-Forwarded-For` values and confirm the 61st is 429, and confirm a second network is not limited at the same time.

Tests: `test/persistence.test.js`, `test/rate-limit.test.js` (support in `test/support/stack.js`, real `SIGKILL` fixture in `test/fixtures/crash-child.js`).

## SMS component (AN6)

The [SMS component](src/sms/README.md) provides tested templates, retry/deduplication handling and a Twilio REST adapter. It is not connected to the running simulation; no real sends have occurred. Live integration needs async engine accounting, recipient URLs/permission projection and AN3 setup. See its README for the contract and remaining acceptance checks.
