import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { SessionStore } from '../src/sessions.js';
import { EscalationEngine } from '../src/escalations.js';
import { SmsSender } from '../src/sms/sender.js';
import { loadSmsConfig, createNotifier } from '../src/notifier.js';

const SID = 'AC' + 'a'.repeat(32), TOKEN = 'SECRET-AUTH-TOKEN-VALUE';
const live = { SMS_MODE: 'live', TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_FROM_NUMBER: '+15555550100',
  PUBLIC_BASE_URL: 'https://rg.example', SMS_ALLOWED_RECIPIENTS: '+15555550101, +15555550102' };
const accepted = { outcome: 'accepted', sid: 'SM' + '1'.repeat(32), providerStatus: 'queued', retryable: false };

test('SMS stays simulated unless explicitly switched on', () => {
  assert.deepEqual(loadSmsConfig({}), { mode: 'simulate' });
  assert.deepEqual(loadSmsConfig({ SMS_MODE: ' Simulate ' }), { mode: 'simulate' });
  assert.deepEqual(loadSmsConfig({ ...live, SMS_MODE: undefined }), { mode: 'simulate' }, 'credentials alone never enable sending');
  assert.throws(() => loadSmsConfig({ SMS_MODE: 'yes' }), /simulate.*live/);
  assert.throws(() => loadSmsConfig({ SMS_MODE: 'on' }), /SMS_MODE/);
});

test('live mode refuses to start unless it is complete, valid, and never echoes a secret', () => {
  const ok = loadSmsConfig(live);
  assert.equal(ok.mode, 'live'); assert.equal(ok.publicBaseUrl, 'https://rg.example');
  assert.deepEqual([...ok.allowedRecipients], ['+15555550101', '+15555550102']);
  for (const name of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'PUBLIC_BASE_URL', 'SMS_ALLOWED_RECIPIENTS']) {
    assert.throws(() => loadSmsConfig({ ...live, [name]: undefined }), new RegExp(name));
    assert.throws(() => loadSmsConfig({ ...live, [name]: '  ' }), new RegExp(name));
  }
  const bad = [{ TWILIO_ACCOUNT_SID: 'ACnope' }, { TWILIO_FROM_NUMBER: '4155550100' }, { PUBLIC_BASE_URL: 'http://rg.example' },
    { PUBLIC_BASE_URL: 'https://rg.example/path' }, { PUBLIC_BASE_URL: 'https://u:p@rg.example' }, { PUBLIC_BASE_URL: 'https://rg.example/?x=1' },
    { PUBLIC_BASE_URL: 'not a url' }, { SMS_ALLOWED_RECIPIENTS: '4155550101' }, { SMS_ALLOWED_RECIPIENTS: '+15555550101,oops' },
    { SMS_ALLOWED_RECIPIENTS: ' , ' }];
  for (const override of bad) {
    try { loadSmsConfig({ ...live, ...override }); assert.fail(`accepted ${JSON.stringify(override)}`); }
    catch (error) {
      assert.ok(!error.message.includes(TOKEN) && !error.message.includes('5555550101'), error.message);
    }
  }
});

const FULL = { receiveAlerts: true, seeLocation: true, seeFullBrief: true, canResolve: true };
const LIMITED = { receiveAlerts: true, seeLocation: false, seeFullBrief: false, canResolve: false };
const person = (n, permissions) => ({ id: `${n}`.repeat(8) + `-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-` + `${n}`.repeat(12),
  name: `Contact ${n}`, phoneE164: `+1555555010${n}`, kind: 'contact', order: Number(n), permissions });
const facts = () => ({ wearerName: 'Alex', selfDescription: 'SENTINEL-HOODIE', lastActiveState: 'dancing', lastActiveUntil: null,
  trigger: { kind: 'fall', at: '2026-10-17T05:42:00Z', reason: 'SENTINEL-REASON' }, promptsUnanswered: 2,
  location: { lat: 43.472391, lon: -80.544913, accuracyM: 12, at: '2026-10-17T05:40:15Z' } });
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };

async function setup(t, { transport, recipients, allowed = ['+15555550101', '+15555550102', '+15555550103'], duress = false } = {}) {
  let clock = Date.parse('2026-10-17T05:42:00Z');
  const sent = [], logs = [];
  const send = transport ?? (async () => accepted);
  const sessions = new SessionStore({ now: () => new Date(clock) });
  const sender = new SmsSender({ transport: async message => { sent.push({ ...message }); return send(message); },
    delay: async () => {}, log: event => logs.push(event) });
  let engine;
  const notify = event => createNotifier({ engine, sender, publicBaseUrl: 'https://rg.example',
    allowedRecipients: new Set(allowed), log: event => logs.push(event) })(event);
  engine = new EscalationEngine({ sessions, now: () => clock, simulated: false, deliver: notify });
  const server = createApp({ sessions, engine, notificationsEnabled: true }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve))); await once(server, 'listening');
  const people = recipients ?? [person('1', FULL), person('2', LIMITED)];
  const { sessionId } = sessions.create({ wearerName: 'Alex', selfDescription: '', demo: true, utcOffsetMinutes: -240, recipients: people });
  const escalationId = engine.register(sessionId, new Date(clock + 35_000).toISOString(), facts());
  if (duress) engine.cancel(escalationId, 'duress');
  return { engine, sessions, sessionId, escalationId, sent, logs, people, base: `http://127.0.0.1:${server.address().port}`,
    advance: async ms => { clock += ms; engine.sweep(); await flush(); },
    state: () => engine.status(escalationId), link: p => `/a/${engine.contactToken(escalationId, p.id)}` };
}

test('the first contact gets their own link in a full-brief message once the deadline passes', async t => {
  const c = await setup(t);
  await c.advance(34_000); assert.equal(c.sent.length, 0, 'nothing before the deadline');
  await c.advance(1_000);
  assert.equal(c.sent.length, 1);
  assert.equal(c.sent[0].to, '+15555550101');
  assert.equal(c.sent[0].body, `Guardian: Alex may need help. Fall detected at 01:42; 2 prompts unanswered. Details: https://rg.example${c.link(c.people[0])}`);
  assert.equal(c.state().recipients[0].notifiedAt !== null, true);
  const page = await fetch(c.base + c.link(c.people[0]) + '/data');
  assert.equal(page.status, 200, 'the link in the SMS opens that contact\'s page');
  assert.match((await page.json()).data.brief, /SENTINEL-REASON/);
});

test('the second contact gets a reduced message with no details, location or sentinel', async t => {
  const c = await setup(t);
  await c.advance(35_000); await c.advance(20_000);
  assert.equal(c.sent.length, 2);
  assert.equal(c.sent[1].to, '+15555550102');
  assert.equal(c.sent[1].body, `Guardian: Alex missed a safety check-in at 01:42. Details: https://rg.example${c.link(c.people[1])}`);
  assert.ok(!/SENTINEL|Fall|43\.47|prompts/.test(c.sent[1].body));
  assert.notEqual(c.link(c.people[0]), c.link(c.people[1]));
});

test('acknowledging from the SMS link stops any further text', async t => {
  const c = await setup(t);
  await c.advance(35_000);
  assert.equal((await fetch(c.base + c.link(c.people[0]) + '/ack', { method: 'POST' })).status, 204);
  await c.advance(10 * 60_000);
  assert.equal(c.sent.length, 1, 'Contact 2 is never texted');
  assert.equal(c.state().state, 'acknowledged');
});

test('a duress escalation texts the urgent message at once', async t => {
  const c = await setup(t, { duress: true });
  await flush();
  assert.equal(c.sent.length, 1);
  assert.equal(c.sent[0].body, `Guardian URGENT: Alex signalled for help. Do not call or text them openly. https://rg.example${c.link(c.people[0])}`);
});

test('a recipient who is not on the allowlist is never texted, and the chain moves straight on', async t => {
  const c = await setup(t, { allowed: ['+15555550102'] });
  await c.advance(35_000);
  assert.equal(c.sent.length, 0, 'the transport is never called for an unlisted number');
  assert.equal(c.state().recipients[0].notifiedAt, null);
  assert.ok(c.logs.some(e => e.type === 'sms-blocked'));
  await c.advance(1_000);                              // far less than a 20 s window
  assert.deepEqual(c.sent.map(m => m.to), ['+15555550102']);
});

test('a definite rejection un-notifies that contact and does not make the next one wait', async t => {
  let calls = 0;
  const c = await setup(t, { transport: async () => ++calls === 1
    ? { outcome: 'rejected', retryable: false, code: 'PROVIDER_REJECTED' } : accepted });
  await c.advance(35_000);
  assert.equal(c.state().recipients[0].notifiedAt, null, 'not shown as notified when nothing was sent');
  assert.equal((await fetch(c.base + c.link(c.people[0]) + '/data')).status, 404, 'and their link is dead');
  await c.advance(1_000);                              // the next sweep, not 20 s later
  assert.equal(c.state().recipients[1].notifiedAt !== null, true);
  assert.equal(calls, 2);
});

test('when every contact rejects, the SOS screen opens without waiting out any window', async t => {
  const c = await setup(t, { transport: async () => ({ outcome: 'rejected', retryable: false, code: 'PROVIDER_REJECTED' }) });
  await c.advance(35_000); await c.advance(1_000); await c.advance(1_000);
  assert.equal(c.state().sosOpen, true);
  assert.deepEqual(c.state().recipients.map(r => r.notifiedAt), [null, null]);
});

test('an uncertain outcome keeps the contact notified and waits the full window', async t => {
  const c = await setup(t, { transport: async () => ({ outcome: 'unknown', retryable: false, code: 'PROVIDER_OUTCOME_UNKNOWN' }) });
  await c.advance(35_000);
  assert.equal(c.state().recipients[0].notifiedAt !== null, true, 'the message may have arrived');
  assert.equal((await fetch(c.base + c.link(c.people[0]) + '/data')).status, 200, 'so its link works');
  await c.advance(5_000);
  assert.equal(c.state().recipients[1].notifiedAt, null, 'the next contact waits for the window');
  await c.advance(15_000);
  assert.equal(c.state().recipients[1].notifiedAt !== null, true);
});

test('a transport that throws is treated as uncertain, never as a crash', async t => {
  const c = await setup(t, { transport: async () => { throw Error('connection reset'); } });
  await c.advance(35_000);
  assert.equal(c.state().recipients[0].notifiedAt !== null, true);
  assert.ok(!JSON.stringify(c.logs).includes('connection reset'));
});

test('a send that finishes after the wearer cancelled changes nothing', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const c = await setup(t, { transport: () => gate });
  await c.advance(35_000);                              // Contact 1's send is now in flight
  c.engine.cancel(c.escalationId, 'safe');
  assert.equal(c.state().state, 'resolved');
  release({ outcome: 'rejected', retryable: false, code: 'PROVIDER_REJECTED' });
  await flush(); await c.advance(10 * 60_000);
  assert.equal(c.state().state, 'resolved'); assert.equal(c.sent.length, 1, 'no further contact is texted');
});

test('a send that finishes after the session ended is harmless', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const c = await setup(t, { transport: () => gate });
  await c.advance(35_000);
  c.sessions.delete(c.sessionId); c.engine.deleteSession(c.sessionId);
  release(accepted); await flush();
  assert.equal(c.engine.owner(c.escalationId), undefined);
});

test('logs hold metadata only: no phone number, link, token, name or message text', async t => {
  const c = await setup(t);
  await c.advance(35_000); await c.advance(20_000);
  const text = JSON.stringify(c.logs);
  assert.ok(c.logs.length > 0);
  for (const secret of ['5555550101', '5555550102', 'Alex', 'rg.example', c.engine.contactToken(c.escalationId, c.people[0].id), 'may need help', 'SENTINEL'])
    assert.ok(!text.includes(secret), `logs leaked ${secret}`);
});

test('the engine event never carries a phone number, token or message', async t => {
  const events = [];
  let clock = Date.parse('2026-10-17T05:42:00Z');
  const sessions = new SessionStore({ now: () => new Date(clock) });
  const engine = new EscalationEngine({ sessions, now: () => clock, deliver: event => events.push(event) });
  const { sessionId } = sessions.create({ wearerName: 'A', selfDescription: '', demo: true, recipients: [person('1', FULL)] });
  const id = engine.register(sessionId, new Date(clock).toISOString(), facts()); engine.sweep();
  assert.equal(events[0].kind, 'alert');
  assert.deepEqual(Object.keys(events[0]).sort(), ['at', 'duress', 'escalationId', 'kind', 'recipientId', 'simulated']);
  assert.deepEqual(engine.deliveryTarget(id, person('1', FULL).id), { to: '+15555550101' });
  assert.equal(engine.deliveryTarget(id, 'nobody'), null);
});

test('the health endpoint says honestly whether SMS is live', async t => {
  const c = await setup(t);
  const body = await (await fetch(c.base + '/health')).json();
  assert.deepEqual([body.stage, body.notificationsEnabled], ['live-sms', true]);
});
