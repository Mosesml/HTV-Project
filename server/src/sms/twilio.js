import { smsSegments } from './templates.js';
export const phonePattern = /^\+[1-9]\d{1,14}$/;
const unknown = extra => ({ outcome: 'unknown', retryable: false, code: 'PROVIDER_OUTCOME_UNKNOWN', ...extra });

// Twilio's own numeric error code (for example 21608, an unverified trial recipient) is what tells
// an operator why a send failed. It is safe to keep: unlike Twilio's message text, which can quote
// the phone number, a bare integer carries nothing private. Anything else in the body is dropped.
async function diagnostics(response) {
  const detail = { httpStatus: response.status };
  try {
    const { code } = await response.json();
    if (Number.isInteger(code) && code >= 10000 && code <= 999999) detail.providerCode = code;
  } catch { /* not JSON: the status alone will do */ }
  return detail;
}

// Only explicitly constructed by a caller; startup does not read credentials or enable this transport.
export function createTwilioTransport({ accountSid, authToken, from, fetchImpl = fetch, timeoutMs = 5000 }) {
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid ?? '') || typeof authToken !== 'string' || !authToken ||
      !phonePattern.test(from ?? '') || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw Error('Invalid Twilio configuration');
  return async ({ to, body }) => {
    if (!phonePattern.test(to ?? '') || typeof body !== 'string' || !body || body.length > 300 || smsSegments(body) > 2)
      throw Error('Invalid SMS payload');
    let response;
    try {
      response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: from, To: to, Body: body })
      });
      if (response.status === 429)
        return { outcome: 'rejected', retryable: true, code: 'RATE_LIMITED', ...await diagnostics(response) };
      if (response.status >= 400 && response.status < 500 && response.status !== 408)
        return { outcome: 'rejected', retryable: false, code: 'PROVIDER_REJECTED', ...await diagnostics(response) };
      if (response.status !== 201) return unknown(await diagnostics(response));
      const result = await response.json();
      if (!/^SM[0-9a-f]{32}$/i.test(result.sid ?? '')) return unknown();
      if (['failed', 'undelivered', 'canceled'].includes(result.status))
        return { outcome: 'rejected', retryable: false, code: 'PROVIDER_REJECTED', sid: result.sid, providerStatus: result.status };
      if (!['accepted', 'queued', 'sending', 'sent', 'delivered', 'scheduled'].includes(result.status)) return unknown();
      return { outcome: 'accepted', sid: result.sid, providerStatus: result.status, retryable: false };
    } catch {
      // Lost response is not proof of rejection. Do not duplicate a possibly accepted message.
      return unknown();
    }
  };
}
