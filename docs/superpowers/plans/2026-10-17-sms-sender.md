# AN6 SMS sender plan

Spec: WORK_ORDER AN6 and PRD ESC-8/ESC-9/B7, checked at acf2483. Implement four templates (normal, reduced, duress, all-clear), bounded safe retry and sanitized provider-SID logging. Existing AN5 remains explicitly simulated until AN8 permission rendering, AN11 recipient URLs and async engine delivery accounting are integrated.

1. Add failing template and fake-transport tests for permissions, Unicode/GSM segment budgets, preserved URLs/duress warning, opt-out, success, safe retry, permanent failure, uncertain outcome, duplicate/concurrent request coalescing and log privacy.
2. Implement templates, a Twilio REST transport with a timeout, and a sender with at most one retry only after definite 429 rejection. Never retry an unknown network/5xx outcome automatically.
3. Run real adapter against mocked fetch (no external SMS), test HTTP form/auth encoding and provider response validation. No credential discovery or real message sends.
4. Document setup/remaining wiring, update QA, review, run local and GitHub QA, recheck upstream and merge only passing code.

Keep ≤300 characters AND ≤2 SMS segments; provider acceptance is not delivery. Unknown results remain unknown and are not recorded as notified. Source/credentials/recipient/link/body never appear in sender logs. No AN3, AN8, AN11 or AN14 live acceptance claims.
