# AN5 escalation engine implementation plan

Goal: implement AN5 against PRD.md and WORK_ORDER.md at a60976f, preserving phone API shapes and named ownership.
Architecture: in-memory engine with injected clock and synchronous simulation delivery sink; authenticated Express routes; one-second server-owned sweep. Real SMS/async provider integration is AN6, rendering/privacy AN8, contact UI AN11, persistence AN13 and all-clear delivery AN14.
Stack: existing Node 22, Express and Zod; Vitest fake timers for engine scheduling, Node tests for HTTP.

- [x] Add failing tests for deadline ownership, demo/real ack windows, cancellation, duress, duplicate fire, ack/resolve, opt-out, deletion, delayed sweep and delivery failure.
- [x] Implement bounded engine records, synchronous simulated delivery and one-second scheduler with explicit teardown. No phone heartbeat or status poll is required for progress.
- [x] Validate BriefFacts/ISO dates using the Swift contract; add register, update, cancel, fire and status routes with session-token ownership before mutations. Test unauthorized/invalid requests and 204 parity.
- [x] Exercise registration through the real process/curl using synthetic settings. Document simulation, future seams and limitations; update QA coverage without claiming real SMS acceptance.
- [ ] Run local QA, independent review, all GitHub jobs; recheck upstream PRD/work order before tested merge.

Constraints: work order overrides PRD; demo/real ack windows 20/120 seconds; supplied absolute check-in deadline; status is exactly state/recipients/sosOpen. No external messages, no client/other-owner source edits, no private ANC-control claims. Current main uses Shortcuts only.

Review focus: no mass catch-up sends after stalled sweep (give each newly notified recipient a full window); safe cancel/ack stops future delivery; retries cannot duplicate a send or reopen closed record; failed simulation sink does not count as notified; deleted sessions lose all escalation state. Retain last heartbeat internally for future brief rendering. Default server health explicitly says simulated delivery and notifications disabled.
