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
