# Andy — escalation server (AN1 foundation + AN4)

The work order assigns Andy the server and Swift escalation client. This server implements **GET /health and the AN4 session API**. It does not implement SMS, contact pages or the escalation engine yet. A healthy response means the process is reachable, not that safety alerts are operational.

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

Use `/health` as the platform health-check path. Once deployed, verify the HTTPS URL from a phone on cellular. **AN1 is not complete until that check passes.** No Twilio key is needed for this session API build. A future production escalation engine needs an always-on instance and persistent storage; the hello-world process is not that engine.

## Next Andy tasks

- AN3: configure Twilio in the chosen hosting account, verify consenting demo recipients, and send the explicitly requested test SMS. No SMS has been sent.
- AN5: server-owned deadline engine with fake-clock tests; AN4 sessions are implemented.
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
