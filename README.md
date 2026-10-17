# HTV-Project adfadf

## Track C — session core

The first Track C feature is a Swift package containing the check-in ladder, its
XCTest suite, and an integration handoff for Track B. It does not yet include the
iOS app, network adapter, audio prompts or hardware integration.

- [Scope, setup, and Justin's backend handoff](docs/track-c-check-in-ladder.md)
- With full Xcode selected: `swift test`
- With Swift command-line tools only: `python3 scripts/check_session_core.py`

Use a separate feature branch for new work and push it for review; do not merge
into main without the team's review. The PRD remains the requirements source.
