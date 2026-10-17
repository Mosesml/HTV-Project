// Test support for AN13: a full server stack (sessions, engine, REAL notifier and sender, app and
// optional snapshot persistence) over an injected clock and a fake SMS transport. Never sends SMS.
import { once } from 'node:events';
import { createApp } from '../../src/app.js';
import { SessionStore } from '../../src/sessions.js';
import { EscalationEngine } from '../../src/escalations.js';
import { SmsSender } from '../../src/sms/sender.js';
import { createNotifier } from '../../src/notifier.js';
import { openPersistence } from '../../src/persistence.js';

export const FULL = { receiveAlerts: true, seeLocation: true, seeFullBrief: true, canResolve: true };
export const LIMITED = { receiveAlerts: true, seeLocation: false, seeFullBrief: false, canResolve: false };
export const person = (n, permissions) => ({ id: `${n}`.repeat(8) + `-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-` + `${n}`.repeat(12),
  name: `Contact ${n}`, phoneE164: `+1555555010${n}`, kind: 'contact', order: Number(n), permissions });
export const facts = () => ({ wearerName: 'Alex', selfDescription: 'SENTINEL-HOODIE', lastActiveState: 'dancing', lastActiveUntil: null,
  trigger: { kind: 'fall', at: '2026-10-17T05:42:00Z', reason: 'SENTINEL-REASON' }, promptsUnanswered: 2,
  location: { lat: 43.472391, lon: -80.544913, accuracyM: 12, at: '2026-10-17T05:40:15Z' } });
export const T0 = Date.parse('2026-10-17T05:42:00Z');
export const accepted = { outcome: 'accepted', sid: 'SM' + '1'.repeat(32), providerStatus: 'queued', retryable: false };
export const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
export const ALLOWED = ['+15555550101', '+15555550102', '+15555550103'];

/**
 * One "process". `clock` is shared by reference ({ t }) so time passes while a process is down.
 * Build a second stack on the same `dir` to simulate a restart; call `stack.die()` on the first
 * (a dead process cannot write a snapshot or answer a request).
 */
export async function makeStack({ dir, clock = { t: T0 }, transport, logs = [], listen = false, fsApi, trustProxy = 0, rateLimit,
  heartbeatDelayMs } = {}) {
  const sent = [];
  const send = transport ?? (async () => accepted);
  const sessions = new SessionStore({ now: () => new Date(clock.t) });
  const sender = new SmsSender({ transport: async message => { sent.push({ ...message }); return send(message); },
    delay: async () => {}, log: event => logs.push(event) });
  let engine;
  const notify = event => createNotifier({ engine, sender, publicBaseUrl: 'https://rg.example',
    allowedRecipients: new Set(ALLOWED), log: event => logs.push(event) })(event);
  engine = new EscalationEngine({ sessions, now: () => clock.t, simulated: false, deliver: notify });
  const persistence = dir ? openPersistence({ dir, sessions, engine, log: event => logs.push(event), now: () => clock.t,
    ...(fsApi && { fsApi }), ...(heartbeatDelayMs !== undefined && { heartbeatDelayMs }) }) : null;
  const stack = { clock, sessions, engine, persistence, sent, logs,
    advance: async ms => { clock.t += ms; engine.sweep(); await flush(); },
    sweep: async () => { engine.sweep(); await flush(); },
    to: number => sent.filter(m => m.to === number).length,
    die: () => { persistence?.close(); engine.stop(); stack.server?.close(); } };
  if (listen) {
    const app = createApp({ sessions, engine, notificationsEnabled: true, persistence, trustProxy, rateLimit });
    stack.server = app.listen(0, '127.0.0.1');
    await once(stack.server, 'listening');
    stack.base = `http://127.0.0.1:${stack.server.address().port}`;
    stack.app = app;
  }
  return stack;
}

/** Create the standard session (Contact 1 full, Contact 2 limited, Contact 3 opted out) and register. */
export function startEscalation(stack, { deadlineInMs = 35_000, key } = {}) {
  const people = [person('1', FULL), person('2', LIMITED), person('3', { ...LIMITED, receiveAlerts: false })];
  const { sessionId, token } = stack.sessions.create({ wearerName: 'Alex', selfDescription: '', demo: true,
    utcOffsetMinutes: -240, recipients: people });
  const escalationId = stack.engine.register(sessionId, new Date(stack.clock.t + deadlineInMs).toISOString(), facts(), key);
  return { people, sessionId, token, escalationId };
}
