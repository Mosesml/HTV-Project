import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { SessionStore } from '../src/sessions.js';
import { EscalationEngine } from '../src/escalations.js';

const facts = { wearerName: 'Synthetic', selfDescription: 'Blue jacket', lastActiveState: 'walking',
  trigger: { kind: 'manual', at: '2026-10-17T12:00:00Z', reason: 'Test' }, promptsUnanswered: 0 };
const settings = { wearerName: 'Synthetic', selfDescription: '', demo: true, recipients: [
  { id: 'f4a94c98-0c17-4ab3-bd04-d7f40f5ad782', name: 'Test recipient', phoneE164: '+14165550123', kind: 'contact', order: 0,
    permissions: { receiveAlerts: true, seeLocation: false, seeFullBrief: false, canResolve: true } } ] };
async function setup(t) {
  let now = Date.parse('2026-10-17T12:00:00Z');
  const sessions = new SessionStore({ now: () => new Date(now) });
  const deliveries = [];
  const engine = new EscalationEngine({ sessions, now: () => now, deliver: e => deliveries.push(e) });
  const server = createApp({ sessions, engine }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve))); await once(server, 'listening');
  const request = (path, method, body, token) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const session = (await (await request('/v1/sessions', 'POST', settings)).json()).data;
  return { request, session, engine, deliveries, advance: ms => { now += ms; } };
}
async function register(ctx) {
  const response = await ctx.request(`/v1/sessions/${ctx.session.sessionId}/escalations`, 'POST', {
    deadline: '2026-10-17T12:00:35Z', facts }, ctx.session.token);
  assert.equal(response.status, 201);
  return (await response.json()).data.escalationId;
}
test('registered deadline runs without heartbeat, facts update, fire/status and deletion follow contract', async t => {
  const c = await setup(t); const id = await register(c); const url = `/v1/escalations/${id}`;
  assert.equal((await c.request(url, 'PATCH', { facts: { ...facts, promptsUnanswered: 2 } }, c.session.token)).status, 204);
  c.advance(35000); c.engine.sweep(); assert.equal(c.deliveries.length, 1);
  const response = await c.request(url, 'GET', undefined, c.session.token);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = (await response.json()).data;
  assert.deepEqual(Object.keys(data).sort(), ['recipients', 'sosOpen', 'state']);
  assert.equal(data.state, 'notifying'); assert.equal(data.recipients[0].notifiedAt, '2026-10-17T12:00:35.000Z');
  assert.ok(!JSON.stringify(data).includes('phoneE164'));
  assert.equal((await c.request(`${url}/fire`, 'POST', { reason: 'three wrong PINs' }, c.session.token)).status, 204);
  assert.equal(c.deliveries.length, 1);
  await c.request(`/v1/sessions/${c.session.sessionId}`, 'DELETE', undefined, c.session.token);
  assert.equal(c.engine.owner(id), undefined);
  assert.equal((await c.request(url, 'GET', undefined, c.session.token)).status, 401);
});
test('safe and duress cancellation return identical bodyless 204; safe prevents delivery, duress fires', async t => {
  const c = await setup(t);
  for (const mode of ['safe', 'duress']) {
    const id = await register(c);
    const response = await c.request(`/v1/escalations/${id}/cancel`, 'POST', { mode }, c.session.token);
    assert.equal(response.status, 204); assert.equal(await response.text(), '');
    assert.equal(c.engine.status(id).state, mode === 'safe' ? 'cancelled' : 'notifying');
  }
  assert.equal(c.deliveries.length, 1); assert.equal(c.deliveries[0].duress, true);
});
test('every escalation route rejects cross-session tokens without mutation', async t => {
  const c = await setup(t); const id = await register(c);
  const other = (await (await c.request('/v1/sessions', 'POST', settings)).json()).data;
  const before = c.engine.inspect(id);
  const paths = [[`/v1/sessions/${c.session.sessionId}/escalations`, 'POST', { deadline: '2026-10-17T12:00:35Z', facts }],
    [`/v1/escalations/${id}`, 'GET'], [`/v1/escalations/${id}`, 'PATCH', { facts }],
    [`/v1/escalations/${id}/cancel`, 'POST', { mode: 'safe' }], [`/v1/escalations/${id}/fire`, 'POST', { reason: 'test' }]];
  for (const [path, method, body] of paths) for (const token of [undefined, 'bad', other.token]) {
    assert.equal((await c.request(path, method, body, token)).status, 401);
    assert.deepEqual(c.engine.inspect(id), before);
  }
  assert.equal(c.deliveries.length, 0);
});
test('malformed facts/date/mode fail validation and closed updates return conflict', async t => {
  const c = await setup(t); const path = `/v1/sessions/${c.session.sessionId}/escalations`;
  for (const body of [{ deadline: 'tomorrow', facts }, { deadline: '2026-10-17T12:00:35Z', facts: { ...facts, location: { lat: 91, lon: 0, accuracyM: 1, at: facts.trigger.at } } },
    { deadline: '2026-10-17T12:00:35Z', facts: { ...facts, rawAudio: 'forbidden' } }]) {
    assert.equal((await c.request(path, 'POST', body, c.session.token)).status, 400);
  }
  const id = await register(c); const url = `/v1/escalations/${id}`;
  assert.equal((await c.request(`${url}/cancel`, 'POST', { mode: 'wrong' }, c.session.token)).status, 400);
  assert.equal((await c.request(`${url}/fire`, 'POST', {}, c.session.token)).status, 400);
  await c.request(`${url}/cancel`, 'POST', { mode: 'safe' }, c.session.token);
  assert.equal((await c.request(url, 'PATCH', { facts }, c.session.token)).status, 409);
  assert.equal((await c.request('/v1/escalations/unknown', 'GET', undefined, c.session.token)).status, 401);
});

// A retried register must never create a second escalation the phone cannot cancel.
const KEY = 'k3J9xQp8Lm2TZt71cwr4Ne0b';
async function registerWithKey(ctx, key, { sessionId = ctx.session.sessionId, token = ctx.session.token,
  deadline = '2026-10-17T12:00:35Z' } = {}) {
  const response = await fetch(`${ctx.base}/v1/sessions/${sessionId}/escalations`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
      ...(key === undefined ? {} : { 'Idempotency-Key': key }) },
    body: JSON.stringify({ deadline, facts }) });
  return { status: response.status, body: await response.json() };
}
async function idempotentSetup(t) {
  const c = await setup(t);
  const probe = await c.request('/v1/sessions', 'POST', settings); // reuse the server for raw fetches
  c.other = (await probe.json()).data;
  c.base = new URL(probe.url).origin;
  return c;
}

test('register with the same Idempotency-Key replays the original escalation', async t => {
  const c = await idempotentSetup(t);
  const first = await registerWithKey(c, KEY);
  const second = await registerWithKey(c, KEY);
  assert.equal(first.status, 201); assert.equal(second.status, 200);
  assert.equal(second.body.data.escalationId, first.body.data.escalationId);
  c.advance(35000); c.engine.sweep();
  assert.equal(c.deliveries.length, 1, 'one escalation means one notification');
});

test('a different key, or no key, registers a separate escalation', async t => {
  const c = await idempotentSetup(t);
  const a = await registerWithKey(c, KEY);
  const b = await registerWithKey(c, `${KEY}-second`);
  const c1 = await registerWithKey(c, undefined);
  const c2 = await registerWithKey(c, undefined);
  assert.equal(new Set([a, b, c1, c2].map(r => r.body.data.escalationId)).size, 4);
  assert.deepEqual([a, b, c1, c2].map(r => r.status), [201, 201, 201, 201]);
});

test('the same key in another session is a different escalation', async t => {
  const c = await idempotentSetup(t);
  const mine = await registerWithKey(c, KEY);
  const theirs = await registerWithKey(c, KEY, { sessionId: c.other.sessionId, token: c.other.token });
  assert.equal(theirs.status, 201);
  assert.notEqual(theirs.body.data.escalationId, mine.body.data.escalationId);
  assert.equal(c.engine.owner(theirs.body.data.escalationId), c.other.sessionId);
});

test('malformed keys are rejected and create nothing', async t => {
  const c = await idempotentSetup(t);
  for (const key of ['short', 'has spaces in it 1234567', 'semi;colon-1234567890', 'x'.repeat(129), '']) {
    const result = await registerWithKey(c, key);
    assert.equal(result.status, 400, JSON.stringify(key));
    assert.equal(result.body.error.code, 'INVALID_REQUEST');
  }
  c.advance(35000); c.engine.sweep();
  assert.equal(c.deliveries.length, 0);
});

test('replaying a key after the escalation closed returns it closed instead of reopening it', async t => {
  const c = await idempotentSetup(t);
  const first = await registerWithKey(c, KEY); const id = first.body.data.escalationId;
  assert.equal((await c.request(`/v1/escalations/${id}/cancel`, 'POST', { mode: 'safe' }, c.session.token)).status, 204);
  const replay = await registerWithKey(c, KEY);
  assert.equal(replay.body.data.escalationId, id);
  const status = await (await c.request(`/v1/escalations/${id}`, 'GET', undefined, c.session.token)).json();
  assert.equal(status.data.state, 'cancelled');
  c.advance(35000); c.engine.sweep();
  assert.equal(c.deliveries.length, 0);
});

test('a key reused with a different deadline is a conflict, not a silent replay', async t => {
  const c = await idempotentSetup(t);
  await registerWithKey(c, KEY);
  const clash = await registerWithKey(c, KEY, { deadline: '2026-10-17T12:05:00Z' });
  assert.equal(clash.status, 409); assert.equal(clash.body.error.code, 'IDEMPOTENCY_MISMATCH');
});

test('concurrent registers with one key produce one escalation', async t => {
  const c = await idempotentSetup(t);
  const results = await Promise.all([1, 2, 3, 4].map(() => registerWithKey(c, KEY)));
  assert.equal(new Set(results.map(r => r.body.data.escalationId)).size, 1);
  assert.equal(results.filter(r => r.status === 201).length, 1);
  c.advance(35000); c.engine.sweep();
  assert.equal(c.deliveries.length, 1);
});

test('a replay does not count against capacity and deleting the session drops the key', async t => {
  const c = await idempotentSetup(t);
  const small = new EscalationEngine({ sessions: new SessionStore(), maxPerSession: 1 });
  const { sessionId } = small.sessions.create(settings);
  const id = small.register(sessionId, '2026-10-17T12:00:35Z', facts, KEY);
  assert.equal(small.register(sessionId, '2026-10-17T12:00:35Z', facts, KEY), id);
  assert.throws(() => small.register(sessionId, '2026-10-17T12:00:35Z', facts, `${KEY}-other`), /capacity/);
  small.deleteSession(sessionId);
  assert.equal(small.replayOf(sessionId, KEY, '2026-10-17T12:00:35Z'), undefined);
  assert.equal(c.engine.owner(id), undefined);
});
