# HTV-Project adfadf

## Current implementation: Andy's escalation foundation

Follow [WORK_ORDER.md](WORK_ORDER.md) for named assignments; it overrides the PRD.
Andy owns the server and escalation integration, and Justin owns motion/session.

- [Server setup and deployment handoff](server/README.md)
- [Offline Swift fake and Justin's integration guide](docs/andy-work-order-handoff.md)

The server currently exposes `/health` only. Swift provides an offline escalation
fake for session development; no real SMS or hosted safety workflow is live yet.
