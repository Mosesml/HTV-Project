# HTV-Project adfadf

## Current implementation: Andy's escalation foundation

Follow [WORK_ORDER.md](WORK_ORDER.md) for named assignments; it overrides the PRD.
Andy owns the server and escalation integration, and Justin owns motion/session.

- [Server setup and deployment handoff](server/README.md)
- [Offline Swift fake and Justin's integration guide](docs/andy-work-order-handoff.md)

The server exposes `/health`, authenticated sessions and a server-owned escalation engine with simulated delivery. Swift provides an offline escalation
fake for session development; no real SMS or hosted safety workflow is live yet.

- [Andy QA: test commands and AN1–AN14 acceptance checklist](docs/andy-qa.md)
