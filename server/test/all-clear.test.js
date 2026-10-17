// AN14: the all-clear text after a late safe cancel. Real notifier, real sender, real contact page and
// routes; fake clock and fake transport. Synthetic numbers only: nothing here can send an SMS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { SessionStore } from '../src/sessions.js';
import { EscalationEngine } from '../src/escalations.js';
import { SmsSender } from '../src/sms/sender.js';
import { createNotifier } from '../src/notifier.js';

const accepted = { outcome: 'accepted', sid: 'SM' + '1'.repeat(32), providerStatus: 'queued', retryable: false };
const rejected = { outcome: 'rejected', retryable: false, code: 'PROVIDER_REJECTED' };
const FULL = { receiveAlerts: true, seeLocation: true, seeFullBrief: true, canResolve: true };
const LIMITED = { receiveAlerts: true, seeLocation: false, seeFullBrief: false, canResolve: false };
const OPTED_OUT = { receiveAlerts: false, seeLocation: false, seeFullBrief: false, canResolve: false };
const person = (n, permissions) => ({ id: `${n}`.repeat(8) + `-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-` + `${n}`.repeat(12),
  name: `Contact ${n}`, phoneE164: `+1555555010${n}`, kind: 'contact', order: Number(n), permissions });
const facts = () => ({ wearerName: 'Alex', selfDescription: 'SENTINEL-HOODIE', lastActiveState: 'dancing', lastActiveUntil: null,
  trigger: { kind: 'fall', at: '2026-10-17T05:42:00Z', reason: 'SENTINEL-REASON' }, promptsUnanswered: 2,
  location: { lat: 43.472391, lon: -80.544913, accuracyM: 12, at: '2026-10-17T05:40:15Z' } });
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
const isAllClear = m => /checked in at/.test(m.body);

// `transport(message)` decides each send; alerts and all-clears both pass through it.
async function setup(t, { transport, people, allowed = ['+15555550101', '+15555550102', '+15555550103'], offset = -240 } = {}) {
  let clock = Date.parse('2026-10-17T05:42:00Z');
  const sent = [], logs = [];
  const allowedSet = new Set(allowed);
  const sessions = new SessionStore({ now: () => new Date(clock) });
  const sender = new SmsSender({ transport: async message => { sent.push({ ...message }); return (transport ?? (async () => accepted))(message); },
    delay: async () => {}, log: event => logs.push(event) });
  let engine, notifier;
  const notify = event => notifier(event);
  engine = new EscalationEngine({ sessions, now: () => clock, simulated: false, deliver: notify });
  notifier = createNotifier({ engine, sender, publicBaseUrl: 'https://rg.example', allowedRecipients: allowedSet,
    log: event => logs.push(event) });
  const server = createApp({ sessions, engine, notificationsEnabled: true }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve))); await once(server, 'listening');
  const list = people ?? [person('1', FULL), person('2', LIMITED)];
  const { sessionId, token } = sessions.create({ wearerName: 'Alex', selfDescription: '', demo: true, utcOffsetMinutes: offset, recipients: list });
  const escalationId = engine.register(sessionId, new Date(clock + 35_000).toISOString(), facts());
  const base = `http://127.0.0.1:${server.address().port}`;
  return { engine, sessions, sessionId, escalationId, sent, logs, people: list, base, notifier, sender, allowedSet,
    advance: async ms => { clock += ms; engine.sweep(); await flush(); },
    state: () => engine.status(escalationId),
    snapshot: () => JSON.stringify(engine.status(escalationId)),
    cancel: async mode => { engine.cancel(escalationId, mode); await flush(); },
    httpCancel: mode => fetch(`${base}/v1/escalations/${escalationId}/cancel`, { method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ mode }) }),
    link: p => `/a/${engine.contactToken(escalationId, p.id)}`,
    allClears: () => sent.filter(isAllClear), now: () => clock };
}

test('late safe cancel after Contact 1 only: Contact 1 gets the all-clear, Contact 2 gets nothing', async t => {
  const c = await setup(t);
  await c.advance(35_000); await c.advance(15_000);       // 05:42:50 UTC = 01:42 local
  assert.equal(c.sent.length, 1);
  await c.cancel('safe');
  assert.equal(c.state().state, 'resolved');
  assert.deepEqual(c.allClears().map(m => [m.to, m.body]), [['+15555550101', 'Guardian: Alex checked in at 01:42. No action needed.']]);
  assert.equal(c.sent.length, 2, 'Contact 2 was never reached, so is not told');
});

test('late safe cancel after Contacts 1 and 2: each gets one, and an opted-out contact gets none', async t => {
  const c = await setup(t, { people: [person('1', FULL), person('2', LIMITED), person('3', OPTED_OUT)] });
  await c.advance(35_000); await c.advance(20_000); await c.advance(30_000);   // 05:43:25 UTC = 01:43 local
  await c.cancel('safe');
  assert.deepEqual(c.allClears().map(m => [m.to, m.body]).sort(), [
    ['+15555550101', 'Guardian: Alex checked in at 01:43. No action needed.'],
    ['+15555550102', 'Guardian: Alex checked in at 01:43. No action needed.']]);
  assert.ok(!c.sent.some(m => m.to === '+15555550103'));
});

test('the time is the cancel time in the wearer\'s own zone, not the deadline or the alert time', async t => {
  const c = await setup(t, { offset: 330 });
  await c.advance(35_000); await c.advance(10 * 1000);
  await c.advance(0);
  c.engine.cancel(c.escalationId, 'safe');           // 05:42:45 UTC + 5h30 = 11:12
  await flush();
  assert.equal(c.allClears()[0].body, 'Guardian: Alex checked in at 11:12. No action needed.');
});

test('a contact whose alert was definitively rejected is not told; if nobody was reached, nobody is', async t => {
  const c = await setup(t, { transport: async () => rejected });
  await c.advance(35_000); await c.advance(1_000); await c.advance(1_000);
  assert.deepEqual(c.state().recipients.map(r => r.notifiedAt), [null, null]);
  await c.cancel('safe');
  assert.equal(c.state().state, 'cancelled');
  assert.equal(c.allClears().length, 0);

  let calls = 0;
  const d = await setup(t, { transport: async () => ++calls === 1 ? rejected : accepted });
  await d.advance(35_000); await d.advance(1_000);
  assert.equal(d.state().recipients[0].notifiedAt, null); assert.notEqual(d.state().recipients[1].notifiedAt, null);
  await d.cancel('safe');
  assert.deepEqual(d.allClears().map(m => m.to), ['+15555550102'], 'only the contact who was actually reached');
});

test('a cancel before any notification sends nothing at all', async t => {
  const c = await setup(t);
  await c.advance(10_000);
  await c.cancel('safe');
  assert.equal(c.state().state, 'cancelled');
  await c.advance(10 * 60_000);
  assert.equal(c.sent.length, 0);
});

test('duplicate, concurrent and replayed cancels produce exactly one text per recipient', async t => {
  const c = await setup(t);
  await c.advance(35_000); await c.advance(20_000);
  const responses = await Promise.all([c.httpCancel('safe'), c.httpCancel('safe'), c.httpCancel('safe')]);
  assert.deepEqual(responses.map(r => r.status), [204, 204, 204]);
  c.engine.cancel(c.escalationId, 'safe'); c.engine.cancel(c.escalationId, 'safe');
  await flush(); await c.advance(60_000);            // reconnect replay, later
  assert.equal((await c.httpCancel('safe')).status, 204); await flush();
  assert.deepEqual(c.allClears().map(m => m.to).sort(), ['+15555550101', '+15555550102']);
  assert.equal(c.sent.length, 4);
});

test('the notifier\'s own de-duplication also holds: the same all-clear event twice is one transport call', async t => {
  const c = await setup(t);
  await c.advance(35_000);
  const event = { kind: 'all-clear', escalationId: c.escalationId, recipientId: c.people[0].id, at: new Date(c.now()).toISOString(),
    duress: false, simulated: false };
  await c.cancel('safe');
  assert.equal(c.allClears().length, 1);
  await c.notifier(event); await c.notifier(event);
  assert.equal(c.allClears().length, 1, 'the stable deliveryId is shared with the engine\'s own send');
});

test('duress then a safe cancel: nothing is sent and the escalation is untouched', async t => {
  const c = await setup(t);
  await c.advance(35_000);
  await c.cancel('duress');
  const before = c.snapshot(), record = JSON.stringify(c.engine.inspect(c.escalationId));
  const sentBefore = c.sent.length;
  await c.cancel('safe');
  assert.equal((await c.httpCancel('safe')).status, 204); await flush();
  await c.advance(10 * 60_000);
  assert.equal(c.allClears().length, 0);
  assert.equal(c.engine.inspect(c.escalationId).duress, true);
  assert.notEqual(c.state().state, 'resolved'); assert.notEqual(c.state().state, 'cancelled');
  assert.equal(c.sent.length >= sentBefore, true);
  assert.ok(!c.sent.some(isAllClear));
  assert.equal(JSON.stringify(c.engine.inspect(c.escalationId)).includes('"state":"resolved"'), false);
  assert.ok(record.includes('"duress":true') && before.length > 0);
});

test('duress from the start, then safe cancel: no state change and no text', async t => {
  const c = await setup(t);
  await c.cancel('duress');                           // fires at once
  const state = c.state().state;
  await c.cancel('safe');
  assert.equal(c.state().state, state);
  assert.ok(!c.sent.some(isAllClear));
});

test('the notifier refuses an all-clear for a duress escalation even if the engine were wrong', async t => {
  const c = await setup(t);
  await c.cancel('duress');
  const before = c.sent.length;
  const result = await c.notifier({ kind: 'all-clear', escalationId: c.escalationId, recipientId: c.people[0].id,
    at: new Date(c.now()).toISOString(), duress: false, simulated: false });
  assert.equal(result.outcome, 'skipped');
  assert.equal(c.sent.length, before);
});

test('a contact tapping Resolve is not the wearer checking in: no text, and a later wearer cancel is a no-op', async t => {
  const c = await setup(t);
  await c.advance(35_000);
  assert.equal((await fetch(c.base + c.link(c.people[0]) + '/resolve', { method: 'POST' })).status, 204);
  await flush();
  assert.equal(c.state().state, 'resolved');
  assert.equal(c.allClears().length, 0);
  assert.ok(!c.sent.some(m => /checked in/.test(m.body)));
  await c.cancel('safe');
  assert.equal(c.allClears().length, 0, 'the escalation was already closed');
});

test('a number that leaves the allowlist is not texted, and the block changes nothing', async t => {
  const c = await setup(t);
  await c.advance(35_000);
  c.allowedSet.delete('+15555550101');
  const before = c.state().recipients;
  await c.cancel('safe');
  assert.equal(c.allClears().length, 0);
  assert.ok(c.logs.some(e => e.type === 'sms-blocked' && e.kind === 'all-clear'));
  assert.equal(c.state().state, 'resolved');
  assert.deepEqual(c.state().recipients, before);

  const d = await setup(t, { allowed: ['+15555550102'] });   // Contact 1 blocked at alert time, Contact 2 allowed
  await d.advance(35_000); await d.advance(1_000);
  await d.cancel('safe');
  assert.deepEqual(d.allClears().map(m => m.to), ['+15555550102']);
});

for (const [name, transport, calls] of [
  ['a definite rejection', { outcome: 'rejected', retryable: false, code: 'PROVIDER_REJECTED' }, 1],
  ['an unknown outcome', { outcome: 'unknown', retryable: false, code: 'PROVIDER_OUTCOME_UNKNOWN' }, 1],
  ['a transport that throws', 'throw', 1]]) {
  test(`${name} on the all-clear leaves the escalation exactly as it was`, async t => {
    const c = await setup(t, { transport: async m => {
      if (!isAllClear(m)) return accepted;
      if (transport === 'throw') throw Error('connection reset to +15555550101');
      return transport; } });
    await c.advance(35_000); await c.advance(20_000);
    const notified = c.state().recipients.map(r => r.notifiedAt);
    c.engine.cancel(c.escalationId, 'safe');           // must not throw
    await flush(); await c.advance(10 * 60_000);
    assert.equal(c.state().state, 'resolved');
    assert.deepEqual(c.state().recipients.map(r => r.notifiedAt), notified, 'nobody is un-notified');
    assert.equal(c.allClears().length, calls * 2, 'one attempt per recipient, no retry for a permanent or uncertain result');
    assert.ok(!JSON.stringify(c.logs).includes('connection reset'));
  });
}

test('AN6 retry policy applies: one retry for a retryable rejection, then stop', async t => {
  let n = 0;
  const c = await setup(t, { people: [person('1', FULL)], transport: async m => {
    if (!isAllClear(m)) return accepted;
    return ++n === 1 ? { outcome: 'rejected', retryable: true, code: 'RATE_LIMITED' } : accepted; } });
  await c.advance(35_000);
  await c.cancel('safe');
  assert.equal(c.allClears().length, 2);
  const d = await setup(t, { people: [person('1', FULL)], transport: async m =>
    isAllClear(m) ? { outcome: 'rejected', retryable: true, code: 'RATE_LIMITED' } : accepted });
  await d.advance(35_000);
  await d.cancel('safe');
  assert.equal(d.allClears().length, 2, 'two attempts at most');
});

test('an engine whose deliver hook throws or rejects on the all-clear still cancels cleanly', async t => {
  for (const hook of [() => { throw Error('boom'); }, () => Promise.reject(Error('boom'))]) {
    let clock = Date.parse('2026-10-17T05:42:00Z');
    const sessions = new SessionStore({ now: () => new Date(clock) });
    const engine = new EscalationEngine({ sessions, now: () => clock,
      deliver: event => event.kind === 'all-clear' ? hook() : undefined });
    const { sessionId } = sessions.create({ wearerName: 'A', selfDescription: '', demo: true, recipients: [person('1', FULL)] });
    const id = engine.register(sessionId, new Date(clock).toISOString(), facts()); engine.sweep();
    engine.cancel(id, 'safe'); await flush();
    assert.equal(engine.status(id).state, 'resolved');
    assert.notEqual(engine.status(id).recipients[0].notifiedAt, null);
  }
});

test('the all-clear event carries no phone, token or text', async t => {
  const events = [];
  let clock = Date.parse('2026-10-17T05:42:00Z');
  const sessions = new SessionStore({ now: () => new Date(clock) });
  const engine = new EscalationEngine({ sessions, now: () => clock, deliver: event => events.push(event) });
  const { sessionId } = sessions.create({ wearerName: 'A', selfDescription: '', demo: true, recipients: [person('1', FULL)] });
  const id = engine.register(sessionId, new Date(clock).toISOString(), facts()); engine.sweep();
  engine.cancel(id, 'safe');
  assert.deepEqual(events.map(e => e.kind), ['alert', 'all-clear']);
  assert.deepEqual(Object.keys(events[1]).sort(), ['at', 'duress', 'escalationId', 'kind', 'recipientId', 'simulated']);
  assert.equal(events[1].at, new Date(clock).toISOString());
});

test('an alert still in flight when the wearer cancels: told only if that alert was not rejected', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const c = await setup(t, { transport: m => isAllClear(m) ? accepted : gate });
  await c.advance(35_000);
  c.engine.cancel(c.escalationId, 'safe'); await flush();
  assert.equal(c.allClears().length, 0, 'waits for the alert to be accounted for');
  release(rejected); await flush();
  assert.equal(c.allClears().length, 0, 'the alert never went out, so there is nothing to call off');

  let release2;
  const gate2 = new Promise(resolve => { release2 = resolve; });
  const d = await setup(t, { transport: m => isAllClear(m) ? accepted : gate2 });
  await d.advance(35_000);
  d.engine.cancel(d.escalationId, 'safe'); await flush();
  release2(accepted); await flush();
  assert.deepEqual(d.allClears().map(m => m.to), ['+15555550101']);
});

test('the session ending between the cancel and the send is harmless', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const c = await setup(t, { transport: m => isAllClear(m) ? accepted : gate });
  await c.advance(35_000);
  c.engine.cancel(c.escalationId, 'safe'); await flush();   // all-clear waits behind the in-flight alert
  c.sessions.delete(c.sessionId);                           // session gone, record not yet swept
  release(accepted); await flush();
  assert.equal(c.allClears().length, 0);
  assert.ok(c.logs.some(e => e.type === 'sms-not-sent' && e.kind === 'all-clear'));

  let release2;
  const gate2 = new Promise(resolve => { release2 = resolve; });
  const d = await setup(t, { transport: m => isAllClear(m) ? accepted : gate2 });
  await d.advance(35_000);
  d.engine.cancel(d.escalationId, 'safe'); await flush();
  d.sessions.delete(d.sessionId); d.engine.deleteSession(d.sessionId);
  release2(accepted); await flush();
  assert.equal(d.allClears().length, 0);
  assert.equal(d.engine.owner(d.escalationId), undefined);
});

test('the all-clear text is exactly the template: name and time only, no brief, location or link', async t => {
  const c = await setup(t);
  await c.advance(35_000); await c.advance(20_000);
  await c.cancel('safe');
  for (const m of c.allClears()) {
    assert.equal(m.body, 'Guardian: Alex checked in at 01:42. No action needed.');
    assert.ok(!/SENTINEL|43\.47|https?:|rg\.example|a\//.test(m.body));
  }
});

test('logs hold metadata only: no phone number, name or message text from the all-clear', async t => {
  const c = await setup(t, { transport: async m => isAllClear(m)
    ? { outcome: 'rejected', retryable: false, code: 'PROVIDER_REJECTED' } : accepted });
  await c.advance(35_000); await c.advance(20_000);
  await c.cancel('safe');
  const text = JSON.stringify(c.logs);
  assert.ok(c.logs.length > 0);
  for (const secret of ['5555550101', '5555550102', 'Alex', 'checked in', 'No action needed', 'rg.example', 'SENTINEL'])
    assert.ok(!text.includes(secret), `logs leaked ${secret}`);
});
