import { randomUUID } from 'node:crypto';
import { payloadFor } from './brief.js';

export class EngineError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const closed = record => ['cancelled', 'resolved'].includes(record.state);

// Simulation only. The sink is synchronous and receives no phone, location or brief.
// AN6 must implement async delivery/retry accounting before enabling real notifications.
export class EscalationEngine {
  #records = new Map();
  #timer;
  constructor({ sessions, now = () => Date.now(), deliver = () => {}, maxPerSession = 100 }) {
    this.sessions = sessions; this.now = now; this.deliver = deliver; this.maxPerSession = maxPerSession;
  }
  start() {
    if (this.#timer) return;
    this.#timer = setInterval(() => this.sweep(), 1000);
    this.#timer.unref?.();
  }
  stop() { clearInterval(this.#timer); this.#timer = undefined; }
  owner(id) { return this.#records.get(id)?.sessionId; }
  #record(id) {
    const record = this.#records.get(id);
    if (!record || !this.sessions.get(record.sessionId)) throw new EngineError(404, 'NOT_FOUND', 'Escalation not found');
    return record;
  }
  // A retried register carries the same key (the phone cannot know whether the first attempt
  // landed), so a repeat returns the original escalation instead of creating a second one that
  // the phone could never cancel.
  replayOf(sessionId, key, deadline) {
    if (key === undefined) return undefined;
    const original = [...this.#records.values()].find(r => r.sessionId === sessionId && r.key === key);
    if (!original) return undefined;
    if (original.deadlineMs !== Date.parse(deadline))
      throw new EngineError(409, 'IDEMPOTENCY_MISMATCH', 'Key was used with a different deadline');
    return original.id;
  }
  register(sessionId, deadline, facts, key) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new EngineError(404, 'NOT_FOUND', 'Session not found');
    const due = Date.parse(deadline);
    if (!Number.isFinite(due)) throw new EngineError(400, 'INVALID_REQUEST', 'Invalid deadline');
    const original = this.replayOf(sessionId, key, deadline);
    if (original) return original;
    if ([...this.#records.values()].filter(r => r.sessionId === sessionId).length >= this.maxPerSession)
      throw new EngineError(409, 'CAPACITY_REACHED', 'Escalation capacity reached; end this session');
    const id = randomUUID();
    this.#records.set(id, { id, sessionId, key, deadlineMs: due, facts: structuredClone(facts), due, deadline,
      state: 'pending', duress: false, sosOpen: false, next: 0, attempts: [],
      ackWindow: session.demo ? 20000 : 120000,
      recipients: session.recipients.filter(r => r.permissions.receiveAlerts).sort((a, b) => a.order - b.order)
        .map(contact => ({ ...contact, notifiedAt: null, ackedAt: null })) });
    // Expired registrations are handled by the next sweep; response never requires a phone poll.
    return id;
  }
  update(id, facts) {
    const record = this.#record(id);
    if (closed(record)) throw new EngineError(409, 'CLOSED', 'Escalation is closed');
    record.facts = structuredClone(facts);
  }
  cancel(id, mode) {
    const record = this.#record(id);
    if (closed(record)) return;
    if (mode === 'safe') {
      record.state = record.recipients.some(r => r.notifiedAt !== null) ? 'resolved' : 'cancelled';
      record.due = null; record.sosOpen = false;
    } else if (mode === 'duress') {
      record.duress = true;
      this.fire(id);
    } else throw new EngineError(400, 'INVALID_REQUEST', 'Invalid cancel mode');
  }
  fire(id) {
    const record = this.#record(id);
    if (record.state !== 'pending') return;
    record.due = this.now(); this.#advance(record);
  }
  acknowledge(id, recipientId) {
    const record = this.#record(id);
    const recipient = this.#notified(record, recipientId);
    if (closed(record)) return;
    recipient.ackedAt ??= new Date(this.now()).toISOString();
    record.state = 'acknowledged'; record.due = null; record.sosOpen = false;
  }
  resolve(id, recipientId) {
    const record = this.#record(id);
    const recipient = this.#notified(record, recipientId);
    if (!recipient.permissions.canResolve) throw new EngineError(403, 'FORBIDDEN', 'Resolution not permitted');
    if (closed(record)) return;
    record.state = 'resolved'; record.due = null; record.sosOpen = false;
  }
  #notified(record, recipientId) {
    const recipient = record.recipients.find(r => r.id === recipientId);
    if (!recipient || recipient.notifiedAt === null) throw new EngineError(403, 'FORBIDDEN', 'Recipient has not been notified');
    return recipient;
  }
  status(id) {
    const record = this.#record(id);
    return { state: record.state, recipients: record.recipients.map(({ name, kind, notifiedAt, ackedAt }) =>
      ({ name, kind, notifiedAt, ackedAt })), sosOpen: record.sosOpen };
  }
  // What this recipient may see of this escalation (AN8); null if they opted out or are not on it.
  view(id, recipientId) {
    const record = this.#record(id);
    const recipient = record.recipients.find(r => r.id === recipientId);
    if (!recipient) return null;
    const session = this.sessions.get(record.sessionId);
    return payloadFor(recipient, { facts: record.facts, deadlineMs: record.deadlineMs, duress: record.duress,
      utcOffsetMinutes: session.utcOffsetMinutes, lastHeartbeatAt: session.lastHeartbeatAt, now: this.now() });
  }
  inspect(id) {
    const record = this.#record(id);
    return structuredClone({ ...record, lastHeartbeatAt: this.sessions.get(record.sessionId).lastHeartbeatAt });
  }
  deleteSession(sessionId) {
    for (const [id, record] of this.#records) if (record.sessionId === sessionId) this.#records.delete(id);
  }
  sweep() {
    for (const [id, record] of this.#records) {
      if (!this.sessions.get(record.sessionId)) { this.#records.delete(id); continue; }
      this.#advance(record);
    }
  }
  #advance(record) {
    const now = this.now();
    if (!['pending', 'notifying'].includes(record.state) || record.due === null || now < record.due) return;
    record.state = 'notifying';
    if (record.next >= record.recipients.length) { record.sosOpen = true; record.due = null; return; }
    const recipient = record.recipients[record.next++];
    const at = new Date(now).toISOString();
    const attempt = { recipientId: recipient.id, at, failed: false };
    try {
      this.deliver({ escalationId: record.id, recipientId: recipient.id, at, duress: record.duress, simulated: true });
      recipient.notifiedAt = at;
    } catch {
      attempt.failed = true;
    }
    record.attempts.push(attempt);
    // Never backdate a notification or burst overdue contacts: each gets a full window now.
    record.due = now + record.ackWindow;
  }
}
