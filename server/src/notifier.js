// Connects the escalation engine to real SMS (AN6 sender + AN8 payloads + AN11 links).
//
// Off by default. SMS_MODE=live turns it on and then refuses to start unless everything it needs is
// present, because a half-configured live server that quietly simulates is worse than one that
// will not boot. The recipient allowlist is required: sessions are created by an unauthenticated
// public endpoint, so without it anyone could name any phone number and make this server text it.
import { SmsSender } from './sms/sender.js';
import { createTwilioTransport, phonePattern } from './sms/twilio.js';

/** Reads and validates the SMS settings. Never echoes a secret in an error. */
export function loadSmsConfig(env = process.env) {
  const mode = (env.SMS_MODE ?? 'simulate').trim().toLowerCase();
  if (mode === 'simulate') return { mode };
  if (mode !== 'live') throw Error('SMS_MODE must be "simulate" or "live"');
  const missing = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'PUBLIC_BASE_URL', 'SMS_ALLOWED_RECIPIENTS']
    .filter(name => !env[name]?.trim());
  if (missing.length) throw Error(`SMS_MODE=live needs ${missing.join(', ')}`);
  const accountSid = env.TWILIO_ACCOUNT_SID.trim(), authToken = env.TWILIO_AUTH_TOKEN.trim();
  const from = env.TWILIO_FROM_NUMBER.trim();
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid)) throw Error('TWILIO_ACCOUNT_SID is not a valid account SID');
  if (!phonePattern.test(from)) throw Error('TWILIO_FROM_NUMBER must be E.164, like +14155550100');
  let base;
  try { base = new URL(env.PUBLIC_BASE_URL.trim()); } catch { throw Error('PUBLIC_BASE_URL is not a URL'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/')
    throw Error('PUBLIC_BASE_URL must be a plain https origin, like https://example.up.railway.app');
  const allowed = env.SMS_ALLOWED_RECIPIENTS.split(',').map(number => number.trim()).filter(Boolean);
  if (!allowed.length || allowed.some(number => !phonePattern.test(number)))
    throw Error('SMS_ALLOWED_RECIPIENTS must be comma-separated E.164 numbers');
  return { mode, accountSid, authToken, from, publicBaseUrl: base.origin, allowedRecipients: new Set(allowed) };
}

/**
 * Returns the engine's `deliver` function: given { escalationId, recipientId, duress }, send that
 * recipient's SMS and resolve to the sender's outcome. Everything it logs is metadata only.
 */
export function createNotifier({ engine, sender, publicBaseUrl, allowedRecipients, log = () => {} }) {
  // AN14: tell a contact who was already texted that the wearer checked in. Same allowlist and the same
  // sender (so the AN6 retry policy and de-duplication apply), under its own stable deliveryId. Whatever
  // happens here stays here: the caller only logs the outcome; it is never an alert result.
  async function allClear(event) {
    try {
      const target = engine.deliveryTarget(event.escalationId, event.recipientId);
      const payload = engine.view(event.escalationId, event.recipientId);
      // Never for duress, even if something upstream got it wrong.
      if (!target || payload === null || payload.mode === 'duress') return { outcome: 'skipped', attempts: 0 };
      if (!allowedRecipients.has(target.to)) {
        log({ type: 'sms-blocked', kind: 'all-clear', reason: 'recipient not on the allowlist' });
        return { outcome: 'rejected', retryable: false, code: 'NOT_ALLOWED', attempts: 0 };
      }
      return await sender.send({ deliveryId: `${event.escalationId}:${event.recipientId}:all-clear`, to: target.to,
        payload, kind: 'all-clear', at: event.at });
    } catch {
      log({ type: 'sms-not-sent', kind: 'all-clear', reason: 'message could not be built' });
      return { outcome: 'rejected', retryable: false, code: 'NOT_SENT', attempts: 0 };
    }
  }
  return async function notify(event) {
    if (event.kind === 'all-clear') return allClear(event);
    const target = engine.deliveryTarget(event.escalationId, event.recipientId);
    const token = engine.contactToken(event.escalationId, event.recipientId);
    const payload = engine.view(event.escalationId, event.recipientId);
    if (!target || !token || payload === null) return { outcome: 'skipped', attempts: 0 };
    if (!allowedRecipients.has(target.to)) {
      log({ type: 'sms-blocked', reason: 'recipient not on the allowlist' });
      return { outcome: 'rejected', retryable: false, code: 'NOT_ALLOWED', attempts: 0 };
    }
    try {
      return await sender.send({ deliveryId: `${event.escalationId}:${event.recipientId}`, to: target.to,
        payload, contactUrl: `${publicBaseUrl}/a/${token}`, mapUrl: `${publicBaseUrl}/a/${token}/map` });
    } catch {
      // A rendering or validation failure sent nothing; say so, so the chain moves on.
      log({ type: 'sms-not-sent', reason: 'message could not be built' });
      return { outcome: 'rejected', retryable: false, code: 'NOT_SENT', attempts: 0 };
    }
  };
}

/** Wires a live notifier for the engine described by `config`, or null when simulating. */
export function liveDelivery(config, log) {
  if (config.mode !== 'live') return null;
  const transport = createTwilioTransport({ accountSid: config.accountSid, authToken: config.authToken, from: config.from });
  const sender = new SmsSender({ transport, log });
  return engine => createNotifier({ engine, sender, publicBaseUrl: config.publicBaseUrl,
    allowedRecipients: config.allowedRecipients, log });
}
