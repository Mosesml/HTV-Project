// J15: opted-in nearby responders, texted after the wearer's own contacts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createApp } from '../src/app.js';
import { SessionStore, distanceM } from '../src/sessions.js';
import { EscalationEngine } from '../src/escalations.js';
import { renderSms, smsSegments } from '../src/sms/templates.js';

const T0 = Date.parse('2026-10-17T05:42:00Z');
const HERE = { lat: 43.472391, lon: -80.544913 };
// Offsets north of HERE, in metres.
const north = (m) => ({ lat: HERE.lat + m / 111_320, lon: HERE.lon });
const FULL = { receiveAlerts: true, seeLocation: true, seeFullBrief: true, canResolve: true };
const contact = (n, kind = 'contact') => ({ id: `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n.repeat(12)}`,
  name: `Contact ${n}`, phoneE164: `+1555555010${n}`, kind, order: Number(n), permissions: FULL });
const facts = (location = { ...HERE, accuracyM: 15, at: new Date(T0).toISOString() }) => ({
  wearerName: 'Alex', selfDescription: 'black hoodie', lastActiveState: 'dancing', lastActiveUntil: null,
  trigger: { kind: 'fall', at: new Date(T0).toISOString(), reason: 'spike 3.1 g' }, promptsUnanswered: 2, location });

function world({ recipients = [contact('1'), contact('2')], location } = {}) {
  let clock = T0;
  const sessions = new SessionStore({ now: () => new Date(clock) });
  const sent = [];
  const engine = new EscalationEngine({ sessions, now: () => clock, deliver: e => { if (e.kind === 'alert') sent.push(e); } });
  const wearer = sessions.create({ wearerName: 'Alex', selfDescription: '', demo: true, recipients }).sessionId;
  const responder = (name, phoneE164, point, at = clock) => {
    const { sessionId } = sessions.create({ wearerName: name, selfDescription: '', demo: true, recipients: [] });
    sessions.setResponder(sessionId, { name, phoneE164, location: { ...point, accuracyM: 10, at: new Date(at).toISOString() } });
    return sessionId;
  };
  const id = engine.register(wearer, new Date(clock + 20_000).toISOString(), facts(location));
  const advance = ms => { clock += ms; engine.sweep(); };
  const kinds = () => engine.status(id).recipients.map(r => `${r.kind}:${r.name}:${r.notifiedAt ? 'notified' : '-'}`);
  return { sessions, engine, wearer, id, responder, advance, kinds, sent, now: () => clock };
}

test('responders within 250 m are texted together after the contacts, with one window, then SOS', () => {
  const w = world();
  w.responder('Sam', '+15555550201', north(100));
  w.responder('Riley', '+15555550202', north(200));
  w.responder('Far', '+15555550203', north(900));
  w.advance(20_000);                                   // deadline: Contact 1
  w.advance(10_000);                                   // Contact 2
  assert.deepEqual(w.kinds(), ['contact:Contact 1:notified', 'contact:Contact 2:notified']);
  w.advance(10_000);                                   // contacts done: the nearby group, all at once
  assert.deepEqual(w.kinds().slice(2), ['nearby:Sam:notified', 'nearby:Riley:notified']);
  assert.equal(w.sent.length, 4);
  assert.equal(w.engine.status(w.id).sosOpen, false);
  w.advance(10_000);                                   // their single window ends
  assert.equal(w.engine.status(w.id).sosOpen, true);
});

test('nobody nearby, a stale fix, or no wearer location skips the step at no cost in time', () => {
  for (const setup of [
    w => {},                                                              // no responders
    w => w.responder('Old', '+15555550201', north(50), T0 - 11 * 60_000), // stale
    w => w.responder('Far', '+15555550201', north(400))]) {               // out of range
    const w = world(); setup(w);
    w.advance(20_000); w.advance(10_000); w.advance(10_000);
    assert.equal(w.engine.status(w.id).sosOpen, true, 'SOS at the usual time');
    assert.ok(!w.kinds().some(k => k.startsWith('nearby')));
  }
  const noFix = world({ location: null });
  noFix.responder('Sam', '+15555550201', north(10));
  noFix.advance(20_000); noFix.advance(10_000); noFix.advance(10_000);
  assert.equal(noFix.engine.status(noFix.id).sosOpen, true);
});

test('the step comes before venue staff, and never repeats', () => {
  const w = world({ recipients: [contact('1'), contact('3', 'venueStaff')] });
  w.responder('Sam', '+15555550201', north(30));
  w.advance(20_000); w.advance(10_000);
  assert.deepEqual(w.kinds(), ['contact:Contact 1:notified', 'nearby:Sam:notified', 'venueStaff:Contact 3:-']);
  w.advance(10_000);
  assert.equal(w.kinds()[2], 'venueStaff:Contact 3:notified');
  w.advance(10_000);
  assert.equal(w.engine.status(w.id).sosOpen, true);
  assert.equal(w.kinds().filter(k => k.startsWith('nearby')).length, 1);
});

test('the wearer, their contacts and at most 5 responders: nearest first', () => {
  const w = world();
  w.sessions.setResponder(w.wearer, { name: 'Alex', phoneE164: '+15555550999', location: { ...HERE, accuracyM: 5, at: new Date(T0).toISOString() } });
  w.responder('Contact 1 again', '+15555550101', north(10));   // already in the chain
  for (let i = 1; i <= 7; i++) w.responder(`R${i}`, `+1555555030${i}`, north(i * 20));
  w.advance(20_000); w.advance(10_000); w.advance(10_000);
  const nearby = w.engine.status(w.id).recipients.filter(r => r.kind === 'nearby').map(r => r.name);
  assert.deepEqual(nearby, ['R1', 'R2', 'R3', 'R4', 'R5']);
});

test('a responder acknowledging stops the chain; their page and SMS are the responder ones', () => {
  const w = world({ recipients: [] });
  w.responder('Sam', '+15555550201', north(40));
  w.advance(20_000);                                  // no contacts: straight to the nearby group
  const sam = w.engine.status(w.id).recipients[0];
  assert.equal(sam.kind, 'nearby');
  const samId = w.engine.inspect(w.id).recipients[0].id;
  const payload = w.engine.view(w.id, samId);
  assert.equal(payload.audience, 'nearby'); assert.equal(payload.variant, 'reduced');
  assert.equal(payload.canResolve, false); assert.ok(payload.location && payload.locationShared);
  w.engine.acknowledge(w.id, samId);
  w.advance(60_000);
  assert.equal(w.engine.status(w.id).state, 'acknowledged');
  assert.equal(w.engine.status(w.id).sosOpen, false);
  assert.throws(() => w.engine.resolve(w.id, samId), /not permitted/);
});

test('one rejected number does not cut the group\'s window short; all rejected moves on', async () => {
  let clock = T0;
  const sessions = new SessionStore({ now: () => new Date(clock) });
  const outcomes = new Map([['+15555550201', 'rejected'], ['+15555550202', 'accepted']]);
  let engine;
  engine = new EscalationEngine({ sessions, now: () => clock, deliver: async e => {
    const to = engine.deliveryTarget(e.escalationId, e.recipientId).to;
    return { outcome: outcomes.get(to) ?? 'accepted' };
  } });
  const wearer = sessions.create({ wearerName: 'Alex', selfDescription: '', demo: true, recipients: [] }).sessionId;
  for (const [name, phone, m] of [['Sam', '+15555550201', 30], ['Riley', '+15555550202', 60]]) {
    const { sessionId } = sessions.create({ wearerName: name, selfDescription: '', demo: true, recipients: [] });
    sessions.setResponder(sessionId, { name, phoneE164: phone, location: { ...north(m), accuracyM: 10, at: new Date(T0).toISOString() } });
  }
  const id = engine.register(wearer, new Date(T0 + 20_000).toISOString(), facts());
  clock += 20_000; engine.sweep();
  await new Promise(r => setImmediate(r));
  clock += 1000; engine.sweep();
  assert.equal(engine.status(id).sosOpen, false, 'Riley was reached: the window stands');
  outcomes.set('+15555550202', 'rejected');
  const second = engine.register(wearer, new Date(clock + 20_000).toISOString(), facts(), 'k2');
  clock += 20_000; engine.sweep();
  await new Promise(r => setImmediate(r));
  clock += 1; engine.sweep();
  assert.equal(engine.status(second).sosOpen, true, 'nobody reached: move on at once');
});

test('responder locations are rounded, never snapshotted, and cleared with the session', () => {
  const w = world();
  const sid = w.responder('Sam', '+15555550201', { lat: 43.4723912, lon: -80.5449133 });
  assert.equal(JSON.stringify(w.sessions.exportState()).includes('43.47'), false, 'no responder location on disk');
  const [found] = w.sessions.nearbyResponders(HERE);
  assert.equal(found.name, 'Sam');
  assert.ok(found.distanceM < 120, 'rounded to ~110 m');
  w.sessions.delete(sid);
  assert.deepEqual(w.sessions.nearbyResponders(HERE), []);
  assert.ok(Math.abs(distanceM(HERE, north(250)) - 250) < 1);
});

test('PUT and DELETE /v1/sessions/:sid/responder need the session token and valid input', async t => {
  const sessions = new SessionStore();
  const server = createApp({ sessions }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve))); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const created = await (await fetch(`${base}/v1/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wearerName: 'Sam', selfDescription: '', recipients: [], demo: true }) })).json();
  const { sessionId, token } = created.data;
  const body = { name: 'Sam', phoneE164: '+15555550201', location: { ...HERE, accuracyM: 12, at: new Date().toISOString() } };
  const put = (b, auth = `Bearer ${token}`) => fetch(`${base}/v1/sessions/${sessionId}/responder`, { method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: auth }, body: JSON.stringify(b) });
  assert.equal((await put(body, 'Bearer ' + 'x'.repeat(43))).status, 401);
  assert.equal((await put({ ...body, phoneE164: '555' })).status, 400);
  assert.equal((await put({ ...body, extra: 1 })).status, 400);
  assert.equal((await put(body)).status, 204);
  assert.equal(sessions.nearbyResponders(HERE).length, 1);
  const del = await fetch(`${base}/v1/sessions/${sessionId}/responder`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
  assert.equal(del.status, 204);
  assert.equal(sessions.nearbyResponders(HERE).length, 0);
});

test('the responder SMS says why they are getting it, carries both links, and fits on the real host', () => {
  const w = world({ recipients: [] });
  w.responder('Sam', '+15555550201', north(40));
  w.advance(20_000);
  const samId = w.engine.inspect(w.id).recipients[0].id;
  const contactUrl = 'https://htv-project-production.up.railway.app/a/' + 'K'.repeat(22);
  const body = renderSms({ payload: w.engine.view(w.id, samId), contactUrl, mapUrl: `${contactUrl}/map` });
  assert.match(body, /^Guardian: Alex needs help near you \(you're a RaveGuard nearby responder\)\. Details: /);
  assert.ok(body.endsWith(`Live location: ${contactUrl}/map`));
  assert.ok(smsSegments(body) <= 2 && body.length <= 300);
  w.engine.cancel(w.id, 'duress');
  const duress = renderSms({ payload: w.engine.view(w.id, samId), contactUrl, mapUrl: `${contactUrl}/map` });
  assert.match(duress, /^Guardian URGENT: Alex, near you, signalled for help\..*Do not approach openly/);
  assert.ok(smsSegments(duress) <= 2);
});

test('the contact page heading speaks to a responder', () => {
  const sandbox = {};
  vm.runInNewContext(readFileSync(new URL('../public/assets/contact.js', import.meta.url), 'utf8'), sandbox);
  const data = { mode: 'normal', nearby: true, wearerName: 'Alex', brief: 'b', sinceSeconds: 0, location: null,
    canResolve: false, status: { state: 'notifying', closed: false, youAcknowledged: false, someoneAcknowledged: false } };
  assert.equal(sandbox.RaveGuardContact.view(data, 0).heading, 'Alex needs help near you');
  assert.equal(sandbox.RaveGuardContact.view({ ...data, nearby: undefined }, 0).heading, 'Check on Alex');
});
