# Andy — escalation server (AN1 foundation)

The work order assigns Andy the server and Swift escalation client. This server currently implements **GET /health only**. It does not implement sessions, SMS, contact pages or the escalation engine yet. A healthy response means the process is reachable, not that safety alerts are operational.

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

Use `/health` as the platform health-check path. Once deployed, verify the HTTPS URL from a phone on cellular. **AN1 is not complete until that check passes.** No Twilio key is needed for this health-only build. A future production escalation engine needs an always-on instance and persistent storage; the hello-world process is not that engine.

## Next Andy tasks

- AN3: configure Twilio in the chosen hosting account, verify consenting demo recipients, and send the explicitly requested test SMS. No SMS has been sent.
- AN4/AN5: authenticated sessions and server-owned deadline engine with zod validation and fake-clock tests.
- AN6/AN8/AN11: delivery, privacy-filtered briefs and contact pages.
- AN7/AN9/AN10: real Swift client, local log/facts and location.
- AN13/AN14: restart recovery and late-cancel all-clear.

See [Andy handoff](../docs/andy-work-order-handoff.md) for the offline fake that unblocks Justin.
