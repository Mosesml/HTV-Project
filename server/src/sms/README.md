# AN6 SMS component

Implements normal, reduced, duress and all-clear templates, a bounded sender, and a Twilio REST transport. **Not wired to the running escalation engine.** The server remains a simulation with `notificationsEnabled: false`; adding environment variables does not enable SMS. No real messages were sent during development or QA.

## Contract

`renderSms(input)` accepts `kind`, `wearerName`, ISO `at`, `recipient` (phoneE164 and permissions), optional `triggerKind`/`promptsUnanswered`, and a recipient-specific `contactUrl` for all except all-clear. It returns text or null for receiveAlerts=false. Missing explicit permissions fail closed. A normal message becomes reduced when seeFullBrief=false; duress retains its warning. No template reads location, raw trigger reason or self-description, even for recipients permitted to see them. AN8 will supply the shared SMS/page permission projection.

Links must be canonical HTTPS with path `/a/<22–64 URL-safe token characters>`, no credentials/query/fragment, and at most 120 characters. The caller must issue the correct recipient token; this module does not create or validate its association. AN11 supplies the contact routes/token store. Do not send the fixture links in these tests to real contacts.

Messages fit both ≤300 UTF-16 code units and a conservative ≤2 SMS segments. Names are shortened if necessary, then replaced with “The wearer” if Unicode encoding would push critical text beyond the budget. URLs and the duress warning are never truncated. Times are labelled UTC. Trigger wording uses a fixed enum; no diagnostic or unverified stillness-duration claim is invented. “Reply OK” is omitted because inbound SMS acknowledgment is unimplemented BL9.

`new SmsSender({ transport, delay?, log?, maxDeliveries? }).send(input)` adds a required stable `deliveryId`. It returns `outcome` (`accepted`, `rejected`, `unknown`, `skipped`), attempt count and available provider metadata. Concurrent/repeated calls with the same ID and rendered destination/content reuse one promise/result. Changed content under the same ID is rejected. Use a distinct event ID for each primary alert, duress update or all-clear. Cache is process-local, bounded at 2,000 entries, and does not evict uncertain outcomes; reaching capacity fails closed. Persistent outcome storage and lifecycle cleanup are required before continuous hosted use (AN13).

Only a definite retryable rejection gets one retry after 1 second (maximum two attempts). The Twilio adapter marks HTTP 429 retryable. Permanent 4xx failures are rejected without retry; HTTP 408, 5xx, network timeouts and malformed successful responses are unknown, because the provider may already have accepted the message. Unknown results are cached, never silently resent. An accepted SID indicates provider acceptance, **not handset delivery**; delivery receipts and integration state must preserve that distinction.

The log callback receives only `type`, attempt, normalized outcome and validated SID. It never receives the message body, name, phone, link, auth token or raw provider exception. Logger failures never cause another send.

## Adapter setup (future integration)

`createTwilioTransport({ accountSid, authToken, from, fetchImpl?, timeoutMs? })` returns an async transport. It sends form-encoded From/To/Body to Twilio's fixed HTTPS Messages endpoint with Basic auth, no redirects, and a 5-second timeout (configurable 1–30,000 ms). Configuration must be passed explicitly; no module reads credentials on import. Store real values only in host secrets, never the app or committed files.

Before connecting it to live sessions:

1. Complete AN1/AN3: hosted HTTPS endpoint, Twilio sender and verified consenting demo recipients.
2. Implement async engine delivery accounting: never hand this async function to AN5's synchronous simulation callback. Persist pending/accepted/unknown outcomes; serialize per-escalation sends; start the acknowledgment window from accepted submission; do not restart a cancelled chain when an in-flight send finishes.
3. Supply the AN8 permission projection and AN11 recipient-specific URL/token records. Do not expose a public arbitrary-send endpoint.
4. Explicitly wire provider-SID logging. Persist deduplication outcomes and handle session cleanup without deleting unresolved send outcomes.
5. Run each template on team phones and record delivery timing/status/segment count without committing phone numbers or secrets. All-clear *delivery triggering* remains AN14; this task supplies its template only.

## QA

`node --test test/sms.test.js` from server/ runs entirely against injected functions and fake HTTP responses; it cannot send messages. It also runs in `npm test`/`npm run qa`. Tests cover all templates, permission suppression, GSM extension and Unicode boundaries, URL preservation, malformed data, timeout uncertainty, at-most-one retry, duplicate/concurrent calls, provider form/auth mapping and log privacy.

Official references used for implementation:

- [Messages REST resource](https://www.twilio.com/docs/messaging/api/message-resource): message creation and provider states.
- [Twilio 20429](https://www.twilio.com/docs/api/errors/20429): 429 rejection is safe to retry.
- [SMS segment limits](https://www.twilio.com/docs/glossary/what-sms-character-limit): GSM-7 versus Unicode budgets.

AN6's work-order acceptance (“Each template arrives on a real phone”) remains pending. Mocked transport tests are component evidence only.
