// AN12 / PRD B6: the seven acceptance scenarios, server side, one test (or block) each.
//
// What is real: the Express app, session store, escalation engine (including its start() sweep loop,
// driven by node:test mock timers), the notifier, the SmsSender, SMS templates, the brief projection
// and the contact page. What is fake: the clock (injected, nobody waits real minutes) and the SMS
// transport (records what Twilio would have been asked to send; no network, no credential).
// The wearer's phone is simulated by calling the HTTP endpoints the Swift ServerClient calls.
//
// These are server-side proofs. They say nothing about the app, AirPods, a locked phone, real SMS
// delivery or the wearer's screens; those still need the device rehearsal in docs/andy-qa.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { SessionStore } from '../src/sessions.js';
import { EscalationEngine } from '../src/escalations.js';
import { SmsSender } from '../src/sms/sender.js';
import { createNotifier } from '../src/notifier.js';

const BASE_URL = 'https://rg.example';
const ACCEPTED = { outcome: 'accepted', sid: 'SM' + '1'.repeat(32), providerStatus: 'queued', retryable: false };
const REJECTED = { outcome: 'rejected', retryable: false, code: 'PROVIDER_REJECTED' };
const PHONES = ['+15555550101', '+15555550102', '+15555550103'];
const SENTINEL = { description: 'SENTINEL-HOODIE', reason: 'SENTINEL-REASON', lat: 43.472391, lon: -80.544913 };

const FULL = { receiveAlerts: true, seeLocation: true, seeFullBrief: true, canResolve: true };
const LIMITED = { receiveAlerts: true, seeLocation: false, seeFullBrief: false, canResolve: false };
const person = (n, permissions, extra = {}) => ({
  id: `${n}`.repeat(8) + `-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-` + `${n}`.repeat(12),
  name: `Contact ${n}`, phoneE164: `+1555555010${n}`, kind: 'contact', order: Number(n), permissions, ...extra });
const CHAIN = () => [person('1', FULL), person('2', LIMITED),
  person('3', LIMITED, { name: 'Venue staff', kind: 'venueStaff' })];

const facts = at => ({ wearerName: 'Alex', selfDescription: SENTINEL.description, lastActiveState: 'dancing',
  lastActiveUntil: '2026-10-17T05:41:30Z',
  trigger: { kind: 'fall', at, reason: SENTINEL.reason }, promptsUnanswered: 2,
  location: { lat: SENTINEL.lat, lon: SENTINEL.lon, accuracyM: 12, at: '2026-10-17T05:40:15Z' } });

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };

/**
 * One server per test. `clock` is the only time source: the session store, the engine and the
 * transport log all read it. engine.start() runs the real 1 s sweep loop on a mocked setInterval,
 * so `step` is "one second of server life".
 */
async function world(t, { transport, allowed = PHONES, startIso = '2026-10-17T05:42:00Z' } = {}) {
  let clock = Date.parse(startIso);
  const sent = [], logs = [];
  const send = transport ?? (async () => ACCEPTED);
  const sessions = new SessionStore({ now: () => new Date(clock) });
  const sender = new SmsSender({
    transport: async message => { sent.push({ ...message, atMs: clock }); return send(message, sent.length); },
    delay: async () => {}, log: event => logs.push(event) });
  let notify;
  const engine = new EscalationEngine({ sessions, now: () => clock, simulated: false, deliver: event => notify(event) });
  notify = createNotifier({ engine, sender, publicBaseUrl: BASE_URL, allowedRecipients: new Set(allowed),
    log: event => logs.push(event) });
  const server = createApp({ sessions, engine, notificationsEnabled: true }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.mock.timers.enable({ apis: ['setInterval'] });
  engine.start();
  t.after(() => engine.stop());

  const api = async (method, path, { body, token, headers = {} } = {}) => {
    const response = await fetch(base + path, { method,
      headers: { ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let json; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, headers: response.headers, text, json };
  };
  const c = {
    sent, logs, engine, sessions, api, base,
    get now() { return clock; },
    /** The wearer's phone starts a session. */
    async newSession({ demo = true, recipients = CHAIN(), utcOffsetMinutes = -240 } = {}) {
      const r = await api('POST', '/v1/sessions', { body: { wearerName: 'Alex', selfDescription: '', recipients,
        demo, utcOffsetMinutes } });
      assert.equal(r.status, 201);
      return { sid: r.json.data.sessionId, token: r.json.data.token, demo };
    },
    heartbeat: session => api('POST', `/v1/sessions/${session.sid}/heartbeat`, { token: session.token }),
    /** The phone registers a check-in whose deadline is 35 s (demo) or 70 s (real) away. */
    async checkIn(session, { key = randomUUID(), deadlineMs } = {}) {
      const startMs = clock;
      const due = deadlineMs ?? startMs + (session.demo ? 35_000 : 70_000);
      const response = await api('POST', `/v1/sessions/${session.sid}/escalations`, { token: session.token,
        headers: { 'idempotency-key': key },
        body: { deadline: new Date(due).toISOString(), facts: facts(new Date(startMs).toISOString()) } });
      return { response, eid: response.json?.data?.escalationId, key, startMs, deadlineMs: due, session };
    },
    cancel: (ci, mode) => api('POST', `/v1/escalations/${ci.eid}/cancel`, { token: ci.session.token, body: { mode } }),
    status: async ci => (await api('GET', `/v1/escalations/${ci.eid}`, { token: ci.session.token })).json.data,
    /** The contact link from the SMS that went to `phone`, as a path. */
    linkFor(phone) {
      const message = sent.find(m => m.to === phone);
      assert.ok(message, `no SMS was sent to ${phone}`);
      const url = /https:\/\/\S+/.exec(message.body)[0];
      assert.ok(url.startsWith(`${BASE_URL}/a/`), url);
      return new URL(url).pathname;
    },
    page: path => api('GET', path),
    data: async path => (await api('GET', `${path}/data`)),
    /** `seconds` of server life, one sweep per second, with SMS sends allowed to settle. */
    async step(seconds = 1) {
      for (let i = 0; i < seconds; i++) { clock += 1000; t.mock.timers.tick(1000); await flush(); }
    },
    /** A long gap in one go (the loop still runs once at the end). */
    async jump(ms) { clock += ms; t.mock.timers.tick(1000); await flush(); },
    /** Set the clock without sweeping (for building up a session history). */
    setClock(ms) { clock = ms; },
    /** Run the ladder second by second; first second at which each name was notified, and SOS. */
    async ladder(ci, seconds) {
      const notified = {}; let sos = null;
      for (let s = 1; s <= seconds; s++) {
        await c.step(1);
        const st = engine.status(ci.eid);
        for (const r of st.recipients) if (r.notifiedAt && !(r.name in notified)) notified[r.name] = s;
        if (st.sosOpen && sos === null) sos = s;
      }
      return { notified, sos };
    }
  };
  return c;
}

// ---------------------------------------------------------------------------------------------
// Scenario 1: Safe
// ---------------------------------------------------------------------------------------------
test('scenario 1 (safe): a cancel before the deadline means nothing is ever sent, even after every window', async t => {
  const c = await world(t);
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  assert.equal(ci.response.status, 201);
  assert.equal((await c.status(ci)).state, 'pending');

  await c.step(10);                                            // the wearer nods 10 s into a 35 s deadline
  const cancel = await c.cancel(ci, 'safe');
  assert.equal(cancel.status, 204);
  const after = await c.status(ci);
  assert.equal(after.state, 'cancelled');
  assert.equal(after.sosOpen, false);
  assert.deepEqual(after.recipients.map(r => r.notifiedAt), [null, null, null]);

  await c.step(100);                                           // past the demo deadline (35) and SOS time (95)
  await c.jump(10 * 60_000);                                   // and past every real window (430 s) as well
  await c.jump(60 * 60_000);
  assert.equal(c.sent.length, 0, 'the SMS transport was never called');
  assert.equal(c.logs.filter(e => e.type === 'sms-attempt').length, 0);
  const end = await c.status(ci);
  assert.equal(end.state, 'cancelled');
  assert.equal(end.sosOpen, false);
  assert.deepEqual(end.recipients.map(r => r.notifiedAt), [null, null, null]);
  // Nobody was ever notified, so nobody has a live link either.
  for (const person of CHAIN()) {
    const path = `/a/${c.engine.contactToken(ci.eid, person.id)}`;
    assert.equal((await c.data(path)).status, 404);
  }
});

// ---------------------------------------------------------------------------------------------
// Scenario 2: No response
// ---------------------------------------------------------------------------------------------
test('scenario 2 (no response): Contact 1 is texted at the deadline with their own link; the page shows the brief', async t => {
  const c = await world(t);
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  for (let s = 1; s <= 34; s++) { await c.step(1); if (s % 10 === 0) await c.heartbeat(session); }   // a live phone
  assert.equal(c.sent.length, 0, 'nothing before the deadline');
  await c.step(1);                                             // the sweep that crosses the deadline
  assert.equal(c.sent.length, 1);
  const [sms] = c.sent;
  assert.ok(sms.atMs - ci.deadlineMs <= 5_000, 'fires within one sweep (<= 5 s) of the deadline');
  assert.equal(sms.atMs - ci.deadlineMs, 0, 'in fact on the first sweep that reaches it');
  assert.equal(sms.to, PHONES[0]);
  const link = c.linkFor(PHONES[0]);
  assert.equal(sms.body, `Guardian: Alex may need help. Fall detected at 01:42; 2 prompts unanswered. Details: ${BASE_URL}${link} Live location: ${BASE_URL}${link}/map`);

  const shell = await c.page(link);
  assert.equal(shell.status, 200);
  assert.match(shell.headers.get('content-type'), /text\/html/);
  const page = await c.data(link);
  assert.equal(page.status, 200);
  assert.equal(page.json.data.mode, 'normal');
  assert.equal(page.json.data.wearerName, 'Alex');
  assert.equal(page.json.data.brief,
    `Alex (${SENTINEL.description}) was dancing until 01:41. Fall detected at 01:42: ${SENTINEL.reason}. 2 check-in prompts went unanswered.`);
  assert.equal(page.json.data.location.mapUrl, 'https://www.google.com/maps/search/?api=1&query=43.472391,-80.544913');
  assert.equal(page.json.data.canResolve, true);
  assert.equal(page.json.data.status.state, 'notifying');
  assert.equal((await c.status(ci)).recipients[0].notifiedAt, new Date(sms.atMs).toISOString());
});

// ---------------------------------------------------------------------------------------------
// Scenario 3: Duress
// ---------------------------------------------------------------------------------------------
test('scenario 3 (duress): the cancel response is identical to a safe cancel, and Contact 1 gets the urgent text at once', async t => {
  const c = await world(t);
  const safeSession = await c.newSession(), duressSession = await c.newSession();
  const safe = await c.checkIn(safeSession), duress = await c.checkIn(duressSession);
  await c.step(10);

  const safeResponse = await c.cancel(safe, 'safe');
  const before = c.sent.length;
  const cancelAt = c.now;
  const duressResponse = await c.cancel(duress, 'duress');
  // The wearer-facing HTTP response: nothing in status, body or headers tells the two apart.
  assert.equal(safeResponse.status, 204); assert.equal(duressResponse.status, 204);
  assert.equal(safeResponse.text, ''); assert.equal(duressResponse.text, '');
  const headers = r => Object.fromEntries([...r.headers].filter(([name]) => name !== 'date'));
  assert.deepEqual(headers(duressResponse), headers(safeResponse));
  assert.ok(!('set-cookie' in headers(duressResponse)));

  await flush();
  assert.equal(c.sent.length - before, 1, 'exactly one SMS: the duress text');
  const sms = c.sent[before];
  assert.ok(sms.atMs - cancelAt <= 15_000, 'within 15 s of the duress cancel (PRD)');
  assert.equal(sms.to, PHONES[0]);
  const link = c.linkFor(PHONES[0]);
  assert.equal(sms.body, `Guardian URGENT: Alex signalled for help. Do not call or text them openly. ${BASE_URL}${link} Live location: ${BASE_URL}${link}/map`);

  const page = await c.data(link);
  assert.equal(page.json.data.mode, 'duress');

  // The page shell is the neutral one, byte for byte the same as a normal alert's shell.
  const normal = await c.newSession(); const normalCi = await c.checkIn(normal);
  await c.step(35);
  const normalSms = c.sent.find(m => m.atMs === normalCi.deadlineMs && m.to === PHONES[0]);
  const normalLink = new URL(/https:\/\/\S+/.exec(normalSms.body)[0]).pathname;
  assert.notEqual(normalLink, link);
  const duressShell = await c.page(link), normalShell = await c.page(normalLink);
  assert.equal(duressShell.text, normalShell.text);
  assert.doesNotMatch(duressShell.text, /duress|urgent|help|Alex/i);
  assert.equal(duressShell.headers.get('cache-control'), 'no-store');

  // Duress is not a safe cancel: the ladder carries on, and later contacts get the urgent text too.
  await c.step(20);
  const second = c.sent.find(m => m.to === PHONES[1] && m.body.startsWith('Guardian URGENT'));
  assert.ok(second, 'Contact 2 gets the urgent text one ack window (20 s) after Contact 1');
  assert.equal(second.atMs - sms.atMs, 20_000);
  assert.equal((await c.data(c.linkFor(PHONES[1]))).json.data.mode, 'duress');
  assert.equal((await c.data(c.linkFor(PHONES[1]))).json.data.location, null);
});

test('scenario 3 (duress): the wearer-side status DOES differ after duress (documented: the client must not surface it)', async t => {
  // The status endpoint is how the phone learns about acks and SOS, so it truthfully reports a fired
  // escalation. Concealment on the wearer's screen is the client's job (PRD scenario 3, track D).
  const c = await world(t);
  const session = await c.newSession();
  const safe = await c.checkIn(session), duress = await c.checkIn(session);
  await c.cancel(safe, 'safe'); await c.cancel(duress, 'duress'); await flush();
  assert.equal((await c.status(safe)).state, 'cancelled');
  assert.equal((await c.status(duress)).state, 'notifying');
});

// ---------------------------------------------------------------------------------------------
// Scenario 4: Connectivity failure
// ---------------------------------------------------------------------------------------------
test('scenario 4 (connectivity failure): a silent phone does not stop the server; the brief says when it went silent', async t => {
  const c = await world(t, { startIso: '2026-10-17T05:30:00Z' });
  const session = await c.newSession();                        // wearer-local time is UTC-4
  // Heartbeats every 10 s up to 05:41:50Z (01:41 local), then airplane mode.
  for (let s = 10; s <= 11 * 60 + 50; s += 10) { c.setClock(Date.parse('2026-10-17T05:30:00Z') + s * 1000); await c.heartbeat(session); }
  c.setClock(Date.parse('2026-10-17T05:42:00Z'));
  const ci = await c.checkIn(session);
  await c.step(35);                                            // no heartbeat, no poll, no PATCH from the phone
  assert.equal(c.sent.length, 1, 'the server fired on schedule');
  assert.equal(c.sent[0].atMs, ci.deadlineMs);
  assert.equal(c.sent[0].to, PHONES[0]);
  const link = c.linkFor(PHONES[0]);
  const data = (await c.data(link)).json.data;
  assert.match(data.brief, /Phone went silent at 01:41\.$/);

  // Control: a phone that keeps sending heartbeats is not reported silent.
  const live = await c.newSession();
  const liveCi = await c.checkIn(live);
  for (let i = 0; i < 3; i++) { await c.step(10); await c.heartbeat(live); }
  await c.step(5);
  const liveSms = c.sent.find(m => m.atMs === liveCi.deadlineMs && m.to === PHONES[0]);
  assert.ok(liveSms, 'the control escalation fired too');
  const liveLink = new URL(/https:\/\/\S+/.exec(liveSms.body)[0]).pathname;
  assert.ok(liveCi.eid);
  assert.doesNotMatch((await c.data(liveLink)).json.data.brief, /silent/);
});

// ---------------------------------------------------------------------------------------------
// Scenario 5: Unacknowledged (demo and real timings)
// ---------------------------------------------------------------------------------------------
for (const [label, demo, at, sosAt] of [['demo', true, [35, 55, 75], 95], ['real', false, [70, 190, 310], 430]]) {
  test(`scenario 5 (unacknowledged, ${label} timings): Contact 1, Contact 2, venue staff, then SOS at ${sosAt} s`, async t => {
    const c = await world(t);
    const session = await c.newSession({ demo });
    const ci = await c.checkIn(session);
    const { notified, sos } = await c.ladder(ci, sosAt - 1);
    assert.deepEqual(notified, { 'Contact 1': at[0], 'Contact 2': at[1], 'Venue staff': at[2] });
    assert.equal(sos, null, 'SOS is not open one second early');
    assert.equal((await c.status(ci)).sosOpen, false);
    await c.step(1);
    const final = await c.status(ci);
    assert.equal(final.sosOpen, true, `SOS opens ${sosAt} s after check-in start (PRD)`);
    assert.equal(final.state, 'notifying');

    // Order, recipients and send times, from the transport's point of view.
    assert.deepEqual(c.sent.map(m => m.to), PHONES);
    assert.deepEqual(c.sent.map(m => (m.atMs - ci.startMs) / 1000), at);
    // Each contact got a different link, the wrong one does not work for anybody else's text.
    const links = PHONES.map(p => c.linkFor(p));
    assert.equal(new Set(links).size, 3);
    for (const link of links) assert.equal((await c.data(link)).status, 200);
    // Nothing more is ever sent, and SOS stays open.
    await c.jump(60 * 60_000);
    assert.equal(c.sent.length, 3);
    assert.equal((await c.status(ci)).sosOpen, true);
  });
}

// ---------------------------------------------------------------------------------------------
// Scenario 6: False alarm (both variants)
// ---------------------------------------------------------------------------------------------
test('scenario 6a (false alarm): Contact 1 taps Mark resolved after the first alert; the chain stops', async t => {
  const c = await world(t);
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  await c.step(35);
  assert.equal(c.sent.length, 1);
  const link = c.linkFor(PHONES[0]);
  assert.equal((await c.api('POST', `${link}/resolve`)).status, 204);
  const wearerView = await c.status(ci);
  assert.equal(wearerView.state, 'resolved', 'the wearer\'s next status poll sees it');
  assert.equal(wearerView.sosOpen, false);
  await c.step(100); await c.jump(30 * 60_000);
  assert.equal(c.sent.length, 1, 'Contact 2 and venue staff are never texted');
  const end = await c.status(ci);
  assert.equal(end.state, 'resolved'); assert.equal(end.sosOpen, false);
  assert.deepEqual(end.recipients.map(r => r.notifiedAt !== null), [true, false, false]);
  assert.equal((await c.data(link)).json.data.status.closed, true);
});

test('scenario 6b (false alarm): the wearer cancels before the deadline; nothing is sent and the state is closed', async t => {
  const c = await world(t);
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  await c.step(30);
  assert.equal((await c.cancel(ci, 'safe')).status, 204);
  await c.step(120); await c.jump(30 * 60_000);
  assert.equal(c.sent.length, 0);
  const end = await c.status(ci);
  assert.equal(end.state, 'cancelled'); assert.equal(end.sosOpen, false);
  // The session itself is still usable: a fresh check-in registers normally (the "active session").
  assert.equal((await c.checkIn(session)).response.status, 201);
});

test('scenario 6 (false alarm, late wearer cancel after the first alert): the chain stops and the state is closed', async t => {
  const c = await world(t);
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  await c.step(40);
  assert.equal((await c.cancel(ci, 'safe')).status, 204);
  await c.step(100); await c.jump(30 * 60_000);
  // Written to hold whether or not an all-clear text exists: only Contact 1 is ever contacted.
  assert.ok(c.sent.every(m => m.to === PHONES[0]), `unexpected recipients: ${c.sent.map(m => m.to)}`);
  assert.ok(c.sent.length >= 1);
  const end = await c.status(ci);
  assert.equal(end.state, 'resolved'); assert.equal(end.sosOpen, false);
  assert.deepEqual(end.recipients.map(r => r.notifiedAt !== null), [true, false, false]);
});

// ---------------------------------------------------------------------------------------------
// Scenario 7: Privacy
// ---------------------------------------------------------------------------------------------
test('scenario 7 (privacy): Contact 2 and venue staff get no location and a reduced brief; Contact 1 does', async t => {
  const c = await world(t);
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  await c.ladder(ci, 80);                                      // scenario 5: through to venue staff
  assert.equal(c.sent.length, 3);
  const [sms1, sms2, sms3] = c.sent;
  const [link1, link2, link3] = PHONES.map(p => c.linkFor(p));

  // SMS: full for Contact 1, reduced for the others.
  assert.equal(sms1.body, `Guardian: Alex may need help. Fall detected at 01:42; 2 prompts unanswered. Details: ${BASE_URL}${link1} Live location: ${BASE_URL}${link1}/map`);
  assert.equal(sms2.body, `Guardian: Alex missed a safety check-in at 01:42. Details: ${BASE_URL}${link2}`);
  assert.equal(sms3.body, `Guardian: Alex missed a safety check-in at 01:42. Details: ${BASE_URL}${link3}`);
  // By design no SMS carries coordinates or a map link (location lives on the page only).
  for (const sms of c.sent) assert.doesNotMatch(sms.body, /maps|43\.4|80\.5|latitude|SENTINEL/i);
  for (const sms of [sms2, sms3]) assert.doesNotMatch(sms.body, /Fall|prompts|dancing|SENTINEL/);

  // Page data: Contact 1 has a map link and the full brief.
  const one = await c.data(link1);
  assert.ok(one.json.data.location.mapUrl.includes('43.472391,-80.544913'));
  assert.match(one.json.data.brief, /SENTINEL-HOODIE/); assert.match(one.json.data.brief, /SENTINEL-REASON/);

  // Contact 2 and venue staff: nothing at all, checked on the raw response text, not only the parsed object.
  for (const link of [link2, link3]) {
    const response = await c.data(link);
    assert.equal(response.status, 200);
    assert.equal(response.json.data.location, null);
    assert.equal(response.json.data.brief, 'Alex missed a safety check-in at 01:42.');
    assert.equal(response.json.data.canResolve, false);
    assert.doesNotMatch(response.text, /maps|mapUrl|43\.4|80\.5|accuracy|SENTINEL|dancing|Fall detected|unanswered|silent/i);
    assert.equal('acknowledgedBy' in response.json.data.status, false);
    // The HTML shell carries no data for anyone.
    assert.doesNotMatch((await c.page(link)).text, /SENTINEL|43\.4|Alex/);
  }

  // A reduced contact cannot resolve or hijack another's link.
  assert.equal((await c.api('POST', `${link2}/resolve`)).status, 403);
  assert.equal((await c.status(ci)).state, 'notifying');
});

// ---------------------------------------------------------------------------------------------
// Edge cases: duplicate requests
// ---------------------------------------------------------------------------------------------
test('duplicates: a repeated register with the same Idempotency-Key returns the same escalation, which cancel then stops', async t => {
  const c = await world(t);
  const session = await c.newSession();
  const key = randomUUID();
  const first = await c.checkIn(session, { key });
  const again = await c.checkIn(session, { key });
  assert.equal(first.response.status, 201); assert.equal(again.response.status, 200);
  assert.equal(again.eid, first.eid);
  // Even two in flight at once.
  const [x, y] = await Promise.all([c.checkIn(session, { key: 'k'.repeat(20) }), c.checkIn(session, { key: 'k'.repeat(20) })]);
  assert.equal(x.eid, y.eid);
  // The same key with a different deadline is refused rather than silently re-registered.
  const clash = await c.checkIn(session, { key, deadlineMs: first.deadlineMs + 1000 });
  assert.equal(clash.response.status, 409); assert.equal(clash.response.json.error.code, 'IDEMPOTENCY_MISMATCH');
  // A malformed key is refused.
  assert.equal((await c.checkIn(session, { key: 'short' })).response.status, 400);

  // The point of idempotency: one cancel stops everything, because there is only one escalation.
  assert.equal((await c.cancel(first, 'safe')).status, 204);
  assert.equal((await c.cancel(x, 'safe')).status, 204);
  await c.step(200);
  assert.equal(c.sent.length, 0, 'no orphaned duplicate escalation fired');
  assert.equal((await c.status(first)).state, 'cancelled');
  assert.equal((await c.status(x)).state, 'cancelled');
});

test('duplicates: a double safe cancel is harmless, and a duress after a safe cancel is ignored', async t => {
  const c = await world(t);
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  const [a, b] = [await c.cancel(ci, 'safe'), await c.cancel(ci, 'safe')];
  assert.deepEqual([a.status, b.status], [204, 204]);
  assert.equal((await c.cancel(ci, 'duress')).status, 204);    // closed: documented, silently a no-op
  await c.step(100);
  assert.equal(c.sent.length, 0);
  assert.equal((await c.status(ci)).state, 'cancelled');
});

test('duplicates: a double duress cancel texts Contact 1 once', async t => {
  const c = await world(t);
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  assert.equal((await c.cancel(ci, 'duress')).status, 204);
  assert.equal((await c.cancel(ci, 'duress')).status, 204);
  await flush();
  assert.equal(c.sent.filter(m => m.to === PHONES[0]).length, 1);
  await c.step(0);
  assert.equal(c.sent.length, 1);
});

test('duplicates: a double acknowledge is idempotent and stops the chain', async t => {
  const c = await world(t);
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  await c.step(35);
  const link = c.linkFor(PHONES[0]);
  assert.equal((await c.api('POST', `${link}/ack`)).status, 204);
  const ackedAt = (await c.status(ci)).recipients[0].ackedAt;
  await c.step(30);
  assert.equal((await c.api('POST', `${link}/ack`)).status, 204);
  assert.equal((await c.status(ci)).recipients[0].ackedAt, ackedAt, 'a repeat does not move the time');
  await c.step(60); await c.jump(30 * 60_000);
  assert.equal(c.sent.length, 1);
  const end = await c.status(ci);
  assert.equal(end.state, 'acknowledged'); assert.equal(end.sosOpen, false);
});

test('duplicates: a double resolve is idempotent, and an ack after resolve does not reopen it', async t => {
  const c = await world(t);
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  await c.step(35);
  const link = c.linkFor(PHONES[0]);
  assert.equal((await c.api('POST', `${link}/resolve`)).status, 204);
  assert.equal((await c.api('POST', `${link}/resolve`)).status, 204);
  assert.equal((await c.api('POST', `${link}/ack`)).status, 204);
  await c.step(120);
  assert.equal(c.sent.length, 1);
  assert.equal((await c.status(ci)).state, 'resolved');
});

test('duplicates: many sweeps at the same instant never text the same contact twice', async t => {
  const c = await world(t);
  const session = await c.newSession();
  await c.checkIn(session);
  await c.step(35);
  for (let i = 0; i < 5; i++) c.engine.sweep();
  await flush();
  assert.equal(c.sent.length, 1);
});

// ---------------------------------------------------------------------------------------------
// Edge cases: a safe cancel at exactly the deadline
// ---------------------------------------------------------------------------------------------
// What the engine does (current main): cancel() never looks at the clock. Whichever of cancel and
// sweep reaches the engine first wins.
//   cancel first -> state 'cancelled', nothing sent, even if the deadline has already passed by the
//                   wall clock but the next 1 s sweep has not yet run (a window of up to 1 s).
//   sweep first  -> Contact 1 is texted (their turn starts at the sweep), then the cancel closes the
//                   escalation as 'resolved' (not 'cancelled'), and nobody after Contact 1 is texted.
// Surprising but defensible: a cancel that arrives after the deadline still suppresses the text.
test('boundary: a safe cancel handled BEFORE the sweep at the exact deadline sends nothing', async t => {
  const c = await world(t);
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  c.setClock(ci.deadlineMs);                                   // the deadline instant, no sweep yet
  assert.equal((await c.cancel(ci, 'safe')).status, 204);
  await c.step(1); await c.step(200);
  assert.equal(c.sent.length, 0);
  assert.equal((await c.status(ci)).state, 'cancelled');
});

test('boundary: a safe cancel still wins when the deadline has passed by under a sweep interval, if handled first', async t => {
  const c = await world(t);
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  c.setClock(ci.deadlineMs + 900);                             // 0.9 s late, sweep not yet run
  await c.cancel(ci, 'safe');
  await c.step(200);
  assert.equal(c.sent.length, 0, 'documented: the engine does not compare the cancel to the deadline');
  assert.equal((await c.status(ci)).state, 'cancelled');
});

test('boundary: a safe cancel handled AFTER the sweep at the exact deadline: Contact 1 was texted, the chain stops', async t => {
  const c = await world(t);
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  await c.step(35);                                            // the sweep at the deadline runs first
  assert.equal((await c.cancel(ci, 'safe')).status, 204);
  await c.step(200); await c.jump(30 * 60_000);
  assert.ok(c.sent.length >= 1 && c.sent.every(m => m.to === PHONES[0]),
    'only Contact 1 is ever texted (an all-clear to them, if one exists, is fine)');
  assert.equal(c.sent[0].atMs, ci.deadlineMs);
  const end = await c.status(ci);
  assert.equal(end.state, 'resolved', 'closed as resolved, not cancelled, because someone had already been notified');
  assert.equal(end.sosOpen, false);
});

test('boundary: one millisecond before the deadline nothing fires', async t => {
  const c = await world(t);
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  c.setClock(ci.deadlineMs - 1); c.engine.sweep(); await flush();
  assert.equal(c.sent.length, 0);
  c.setClock(ci.deadlineMs); c.engine.sweep(); await flush();
  assert.equal(c.sent.length, 1);
});

// ---------------------------------------------------------------------------------------------
// Edge cases: provider failure
// ---------------------------------------------------------------------------------------------
test('provider failure: Twilio rejects Contact 1, so Contact 2 is texted on the next sweep (not after a window)', async t => {
  const c = await world(t, { transport: async (_message, call) => call === 1 ? REJECTED : ACCEPTED });
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  await c.step(35);
  assert.equal(c.sent.length, 1);
  assert.equal(c.sent[0].to, PHONES[0]);
  const after = await c.status(ci);
  assert.equal(after.recipients[0].notifiedAt, null, 'not shown as notified when nothing was sent');
  assert.equal((await c.data(c.linkFor(PHONES[0]))).status, 404, 'their link is dead');
  await c.step(1);
  assert.equal(c.sent.length, 2);
  assert.equal(c.sent[1].to, PHONES[1]);
  assert.equal(c.sent[1].atMs - ci.deadlineMs, 1000, 'one sweep later, far less than the 20 s window');
  assert.equal(c.sent[1].body.startsWith('Guardian: Alex missed a safety check-in'), true, 'Contact 2 gets their own reduced text');
  assert.equal((await c.data(c.linkFor(PHONES[1]))).status, 200);
});

test('provider failure: a retryable rejection is retried once and Contact 1 is still texted', async t => {
  const c = await world(t, { transport: async (_message, call) => call === 1
    ? { outcome: 'rejected', retryable: true, code: 'RATE_LIMITED' } : ACCEPTED });
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  await c.step(35);
  assert.equal(c.sent.length, 2, 'one retry');
  assert.deepEqual(c.sent.map(m => m.to), [PHONES[0], PHONES[0]]);
  assert.equal(c.sent[0].body, c.sent[1].body);
  assert.notEqual((await c.status(ci)).recipients[0].notifiedAt, null);
  await c.step(10);
  assert.equal(c.sent.length, 2, 'Contact 2 still waits for the window');
});

test('provider failure: when every contact is rejected, SOS opens without waiting out any window', async t => {
  const c = await world(t, { transport: async () => REJECTED });
  const session = await c.newSession();
  const ci = await c.checkIn(session);
  const { notified, sos } = await c.ladder(ci, 40);            // far short of the 95 s demo SOS time
  assert.deepEqual(notified, {}, 'nobody is ever shown as notified');
  assert.ok(sos !== null && sos <= 35 + 5, `SOS opened at ${sos} s`);
  assert.equal((await c.status(ci)).sosOpen, true);
  assert.deepEqual(c.sent.map(m => m.to), PHONES, 'each contact was tried exactly once, in order');
  for (const phone of PHONES) assert.equal((await c.data(c.linkFor(phone))).status, 404);
});
