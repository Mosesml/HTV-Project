import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { renderSms } from './templates.js';
import { phonePattern } from './twilio.js';

const statuses = ['accepted', 'queued', 'sending', 'sent', 'delivered', 'scheduled', 'failed', 'undelivered', 'canceled'];
function normalize(result) {
  const unknown = { outcome: 'unknown', retryable: false, code: 'TRANSPORT_OUTCOME_UNKNOWN' };
  if (!result || !['accepted', 'rejected', 'unknown'].includes(result.outcome)) return unknown;
  const sid = /^SM[0-9a-f]{32}$/i.test(result.sid ?? '') ? result.sid : undefined;
  if (result.outcome === 'accepted' && (!sid || !statuses.slice(0, 6).includes(result.providerStatus))) return unknown;
  const clean = { outcome: result.outcome, retryable: result.outcome === 'rejected' && result.retryable === true };
  if (sid) clean.sid = sid;
  if (statuses.includes(result.providerStatus)) clean.providerStatus = result.providerStatus;
  if (['RATE_LIMITED', 'PROVIDER_REJECTED', 'PROVIDER_OUTCOME_UNKNOWN', 'TRANSPORT_OUTCOME_UNKNOWN'].includes(result.code)) clean.code = result.code;
  return clean;
}

// In-memory coalescing is NOT persistent exactly-once delivery. AN13 must retain these outcomes.
export class SmsSender {
  #deliveries = new Map();
  constructor({ transport, delay = ms => setTimeout(ms), log = () => {}, maxDeliveries = 2000 }) {
    if (typeof transport !== 'function') throw Error('SMS transport required');
    this.transport = transport; this.delay = delay; this.log = log; this.maxDeliveries = maxDeliveries;
  }
  async send(input) {
    const { deliveryId } = input;
    if (typeof deliveryId !== 'string' || !deliveryId || deliveryId.length > 100) throw Error('deliveryId required');
    const body = renderSms(input);
    if (body === null) return { outcome: 'skipped', attempts: 0 };
    if (!phonePattern.test(input.to ?? '')) throw Error('Invalid recipient phone');
    const to = input.to;
    const fingerprint = createHash('sha256').update(JSON.stringify({ to, body })).digest('hex');
    const existing = this.#deliveries.get(deliveryId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw Error('deliveryId cannot be reused for different content');
      return structuredClone(await existing.promise);
    }
    if (this.#deliveries.size >= this.maxDeliveries) throw Error('SMS delivery capacity reached');
    // Defer execution until the promise is installed so simultaneous callers share one attempt.
    const promise = Promise.resolve().then(() => this.#send({ to, body }));
    this.#deliveries.set(deliveryId, { fingerprint, promise });
    return structuredClone(await promise);
  }
  async #send(message) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let result;
      try { result = await this.transport(message); }
      catch { result = { outcome: 'unknown', retryable: false, code: 'TRANSPORT_OUTCOME_UNKNOWN' }; }
      result = normalize(result);
      // Log only whitelisted metadata, never provider error text, recipient, URL, or body.
      const event = { type: 'sms-attempt', attempt, outcome: result.outcome };
      if (/^SM[0-9a-f]{32}$/i.test(result.sid ?? '')) event.sid = result.sid;
      try { this.log(event); } catch { /* Logging failure must not trigger another SMS. */ }
      if (result.outcome === 'rejected' && result.retryable === true && attempt === 1) {
        await this.delay(1000); continue;
      }
      return { ...result, attempts: attempt };
    }
  }
}
