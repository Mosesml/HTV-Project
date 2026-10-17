import { smsSegments } from './templates.js';
export const phonePattern = /^\+[1-9]\d{1,14}$/;
const unknown = () => ({ outcome: 'unknown', retryable: false, code: 'PROVIDER_OUTCOME_UNKNOWN' });

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
      if (response.status === 429) {
        await response.body?.cancel();
        return { outcome: 'rejected', retryable: true, code: 'RATE_LIMITED' };
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 408) {
        await response.body?.cancel();
        return { outcome: 'rejected', retryable: false, code: 'PROVIDER_REJECTED' };
      }
      if (response.status !== 201) { await response.body?.cancel(); return unknown(); }
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
