import { randomBytes, randomUUID } from 'node:crypto';
import { payloadFor } from './brief.js';

export class EngineError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const closed = record => ['cancelled', 'resolved'].includes(record.state);

// Simulation only. The sink is synchronous and receives no phone, location or brief.
// AN6 must implement async delivery/retry accounting before enabling real notifications.
export class EscalationEngine {
  #records = new Map();
  #tokens = new Map();   // recipient link token -> { escalationId, recipientId }
  #timer;
  #inflight = new Map();   // `${escalationId}:${recipientId}` -> promise that settles once that alert send is accounted for
  // `deliver(event)` may return a promise of { outcome: 'accepted' | 'rejected' | 'unknown' | 'skipped' }
  // (see notifier.js). `simulated` only labels the event; it never gates sending.
  constructor({ sessions, now = () => Date.now(), deliver = () => {}, maxPerSession = 100, simulated = true }) {
    this.sessions = sessions; this.now = now; this.deliver = deliver; this.maxPerSession = maxPerSession;
    this.simulated = simulated;
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
        .map(contact => ({ ...contact, notifiedAt: null, ackedAt: null, token: this.#issueToken(id, contact.id) })) });
    // Expired registrations are handled by the next sweep; response never requires a phone poll.
    return id;
  }
  // 128 random bits per recipient per escalation (22 base64url characters). The link is dead until
  // that recipient has actually been notified, and with its escalation or session.
  #issueToken(escalationId, recipientId) {
    const token = randomBytes(16).toString('base64url');
    this.#tokens.set(token, { escalationId, recipientId });
    return token;
  }
  #drop(id) {
    const record = this.#records.get(id);
    for (const { token } of record?.recipients ?? []) this.#tokens.delete(token);
    this.#records.delete(id);
  }
  /** The path component for this recipient's contact page, for the SMS link. */
  contactToken(escalationId, recipientId) {
    return this.#records.get(escalationId)?.recipients.find(r => r.id === recipientId)?.token;
  }
  /** Token to { escalationId, recipientId }, or null for anything not currently valid. */
  resolveToken(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(token)) return null;
    const ref = this.#tokens.get(token);
    const record = ref && this.#records.get(ref.escalationId);
    if (!record || !this.sessions.get(record.sessionId)) return null;
    const recipient = record.recipients.find(r => r.id === ref.recipientId);
    return recipient?.notifiedAt ? { ...ref } : null;
  }
  /** What the contact page shows about progress, plus server-clock ages for "N minutes ago". */
  pageStatus(escalationId, recipientId) {
    const record = this.#record(escalationId);
    const me = record.recipients.find(r => r.id === recipientId);
    const ackers = record.recipients.filter(r => r.ackedAt !== null);
    const age = since => Math.max(0, Math.floor((this.now() - since) / 1000));
    return { state: record.state, youAcknowledged: !!me?.ackedAt, someoneAcknowledged: ackers.length > 0,
      acknowledgedBy: ackers.map(r => r.name),
      sinceTriggerSeconds: age(Date.parse(record.facts.trigger.at)), sinceDeadlineSeconds: age(record.deadlineMs) };
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
      // AN14: a duress escalation is never closed by a safe cancel, so it can never produce an all-clear.
      if (record.duress) return;
      const notified = record.recipients.filter(r => r.notifiedAt !== null);
      record.state = notified.length ? 'resolved' : 'cancelled';
      record.due = null; record.sosOpen = false;
      this.#allClear(record, notified);   // runs once: the record is closed from here on
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
    const { recipients, ...rest } = record;   // link tokens are secrets: never in a debug dump
    return structuredClone({ ...rest, recipients: recipients.map(({ token, ...r }) => r),
      lastHeartbeatAt: this.sessions.get(record.sessionId).lastHeartbeatAt });
  }
  deleteSession(sessionId) {
    for (const [id, record] of this.#records) if (record.sessionId === sessionId) this.#drop(id);
  }
  sweep() {
    for (const [id, record] of this.#records) {
      if (!this.sessions.get(record.sessionId)) { this.#drop(id); continue; }
      this.#advance(record);
    }
  }
  // A send finished after the fact. Only a definite "nothing was sent" changes anything: the
  // recipient is not shown as notified, and the next contact goes now instead of after a window
  // nobody was told about. An uncertain outcome (timeout) keeps them notified: it may have arrived.
  #settle(escalationId, recipientId, attempt, result) {
    const record = this.#records.get(escalationId);
    const recipient = record?.recipients.find(r => r.id === recipientId);
    attempt.outcome = result?.outcome ?? 'unknown';
    if (!recipient || (attempt.outcome !== 'rejected' && attempt.outcome !== 'skipped')) return;
    attempt.failed = true;
    if (recipient.ackedAt) return;
    recipient.notifiedAt = null;
    if (record.state === 'notifying' && record.due !== null) record.due = this.now();
  }
  /** The destination for the notifier only; never part of an event, status or log. */
  deliveryTarget(escalationId, recipientId) {
    const recipient = this.#records.get(escalationId)?.recipients.find(r => r.id === recipientId);
    return recipient ? { to: recipient.phoneE164 } : null;
  }
  // AN14: the wearer checked in after the alert went out. Tell exactly the contacts who were texted.
  // Fire-and-forget: a failure here never un-notifies anyone, changes state, or reaches the caller.
  // A contact whose alert is still in flight is told only if that alert turns out not to have been rejected.
  #allClear(record, notified) {
    const at = new Date(this.now()).toISOString();
    for (const recipient of notified) {
      const send = () => {
        const current = this.#records.get(record.id)?.recipients.find(r => r.id === recipient.id);
        if (!current || current.notifiedAt === null) return;
        try {
          const sending = this.deliver({ kind: 'all-clear', escalationId: record.id, recipientId: recipient.id, at,
            duress: false, simulated: this.simulated });
          sending?.then?.(() => {}, () => {});
        } catch { /* nothing to undo */ }
      };
      const inflight = this.#inflight.get(`${record.id}:${recipient.id}`);
      if (inflight) inflight.then(send, send); else send();
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
      const sending = this.deliver({ kind: 'alert', escalationId: record.id, recipientId: recipient.id, at, duress: record.duress,
        simulated: this.simulated });
      // Notified from the start of their turn: a message may be on its way, so their link works and
      // the ack window runs from now, so a slow provider can never stretch the chain.
      recipient.notifiedAt = at;
      if (typeof sending?.then === 'function') {
        const key = `${record.id}:${recipient.id}`;
        const done = sending.then(result => this.#settle(record.id, recipient.id, attempt, result),
          () => this.#settle(record.id, recipient.id, attempt, { outcome: 'unknown' }))
          .finally(() => { if (this.#inflight.get(key) === done) this.#inflight.delete(key); });
        this.#inflight.set(key, done);
      }
    } catch {
      attempt.failed = true;
    }
    record.attempts.push(attempt);
    // Never backdate a notification or burst overdue contacts: each gets a full window now.
    record.due = now + record.ackWindow;
  }
}
