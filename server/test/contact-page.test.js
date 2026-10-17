import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createApp } from '../src/app.js';
import { SessionStore } from '../src/sessions.js';
import { EscalationEngine } from '../src/escalations.js';

const SECRET = { description: 'SENTINEL-HOODIE', reason: 'SENTINEL-REASON', lat: 43.472391, lon: -80.544913 };
const facts = () => ({ wearerName: 'Alex', selfDescription: SECRET.description, lastActiveState: 'dancing',
  lastActiveUntil: '2026-10-17T05:41:30Z',
  trigger: { kind: 'fall', at: '2026-10-17T05:42:00Z', reason: SECRET.reason }, promptsUnanswered: 2,
  location: { lat: SECRET.lat, lon: SECRET.lon, accuracyM: 12, at: '2026-10-17T05:40:15Z' } });
const person = (n, permissions) => ({ id: `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n.repeat(12)}`,
  name: `Contact ${n}`, phoneE164: `+1555555010${n}`, kind: 'contact', order: Number(n), permissions });
const FULL = { receiveAlerts: true, seeLocation: true, seeFullBrief: true, canResolve: true };
const LIMITED = { receiveAlerts: true, seeLocation: false, seeFullBrief: false, canResolve: false };

async function setup(t, { duress = false } = {}) {
  let clock = Date.parse('2026-10-17T05:42:00Z');
  const sessions = new SessionStore({ now: () => new Date(clock) });
  const deliveries = [];
  const engine = new EscalationEngine({ sessions, now: () => clock, deliver: e => deliveries.push(e) });
  const server = createApp({ sessions, engine }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve))); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const one = person('1', FULL), two = person('2', LIMITED), three = person('3', { ...LIMITED, receiveAlerts: false });
  const { sessionId } = sessions.create({ wearerName: 'Alex', selfDescription: '', demo: true, utcOffsetMinutes: -240,
    recipients: [one, two, three] });
  const escalationId = engine.register(sessionId, new Date(clock + 35_000).toISOString(), facts());
  if (duress) engine.cancel(escalationId, 'duress');
  const c = { base, sessions, engine, deliveries, sessionId, escalationId, one, two, three,
    advance: ms => { clock += ms; engine.sweep(); },
    token: p => engine.contactToken(escalationId, p.id),
    get: (path) => fetch(base + path), post: (path) => fetch(base + path, { method: 'POST' }),
    data: async p => (await (await fetch(`${base}/a/${engine.contactToken(escalationId, p.id)}/data`)).json()).data };
  return c;
}
const notify = c => { c.advance(35_000); };       // Contact 1's turn
const notifyBoth = c => { c.advance(35_000); c.advance(20_000); };   // then Contact 2's

test('a link is dead until that recipient has been notified, and every dead link answers the same way', async t => {
  const c = await setup(t);
  const t1 = c.token(c.one), t2 = c.token(c.two);
  assert.match(t1, /^[A-Za-z0-9_-]{22}$/); assert.notEqual(t1, t2);
  assert.equal(c.token(c.three), undefined, 'an opted-out recipient gets no link');
  const dead = [];
  for (const [method, path] of [['GET', ''], ['GET', '/data'], ['POST', '/ack'], ['POST', '/resolve']]) {
    const response = await fetch(`${c.base}/a/${t1}${path}`, { method });   // before anyone is notified
    dead.push([response.status, await response.text()]);
  }
  notify(c);   // Contact 1 notified; Contact 2 is still waiting
  assert.equal((await c.get(`/a/${t1}`)).status, 200);
  for (const path of ['', '/data']) assert.equal((await c.get(`/a/${t2}${path}`)).status, 404);
  assert.equal((await c.post(`/a/${t2}/ack`)).status, 404);
  assert.equal(c.engine.status(c.escalationId).recipients[1].ackedAt, null, 'a not-yet-notified link cannot acknowledge');
  for (const bad of ['short', 'x'.repeat(22), `${t1}x`, encodeURIComponent('<script>'), `${t1}%00`]) {
    const response = await c.get(`/a/${bad}`);
    assert.equal(response.status, 404); dead.push([response.status, await response.text()]);
  }
  assert.equal(new Set(dead.map(([status, body]) => `${status}|${body}`)).size, 1);
  assert.equal(dead[0][1], 'This link is not active.');
});

test('the page shell is neutral, static and locked down, and identical for normal and duress', async t => {
  const normal = await setup(t); notify(normal);
  const duress = await setup(t, { duress: true });
  const page = await normal.get(`/a/${normal.token(normal.one)}`);
  const body = await page.text();
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.match(page.headers.get('x-robots-tag'), /noindex/);
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/); assert.match(csp, /script-src 'self'/); assert.match(csp, /frame-ancestors 'none'/);
  assert.ok(!/unsafe-inline|unsafe-eval|https?:/.test(csp));
  assert.match(body, /<title>Safety check<\/title>/);
  assert.ok(!/<script(?![^>]*\ssrc=)/i.test(body), 'no inline script');
  assert.ok(!/\sstyle=|\son\w+=/i.test(body), 'no inline style or handlers');
  assert.ok(!/SENTINEL|Alex|tel:/.test(body), 'the shell carries no data');
  const duressBody = await (await duress.get(`/a/${duress.token(duress.one)}`)).text();
  assert.equal(duressBody, body, 'duress and normal serve the same bytes');
});

test('page data is filtered per recipient by the AN8 projection', async t => {
  const c = await setup(t); notifyBoth(c);
  const full = await c.data(c.one), limited = await c.data(c.two);
  assert.equal(full.mode, 'normal'); assert.equal(full.wearerName, 'Alex');
  assert.match(full.brief, /SENTINEL-HOODIE/); assert.match(full.brief, /SENTINEL-REASON/);
  assert.equal(full.location.mapUrl, 'https://www.google.com/maps/search/?api=1&query=43.472391,-80.544913');
  assert.equal(full.canResolve, true);
  assert.deepEqual(Object.keys(full).sort(), ['brief', 'canResolve', 'location', 'mode', 'sinceSeconds', 'status', 'wearerName']);
  assert.equal(limited.brief, 'Alex missed a safety check-in at 01:42.');
  assert.equal(limited.location, null); assert.equal(limited.canResolve, false);
  assert.ok(!/SENTINEL|43\.47|80\.54|dancing|spike/.test(JSON.stringify(limited)));
  assert.equal('acknowledgedBy' in limited.status, false);
  assert.equal('acknowledgedBy' in full.status, true);
});

test('"minutes since" comes from the server clock: the trigger for a full brief, the missed deadline for a reduced one', async t => {
  const c = await setup(t); notifyBoth(c);          // clock = trigger + 55 s; deadline was at +35 s
  c.advance(65_000);                                  // trigger + 120 s; deadline + 85 s
  assert.equal((await c.data(c.one)).sinceSeconds, 120);
  assert.equal((await c.data(c.two)).sinceSeconds, 85);
});

test('acknowledge stops the chain, is idempotent, and shows on the wearer\'s status and the other contact\'s page', async t => {
  const c = await setup(t); notify(c);
  assert.equal(c.deliveries.length, 1);
  const t1 = c.token(c.one);
  assert.equal((await c.post(`/a/${t1}/ack`)).status, 204);
  const status = c.engine.status(c.escalationId);
  assert.equal(status.state, 'acknowledged');
  assert.equal(status.recipients[0].ackedAt, '2026-10-17T05:42:35.000Z');
  assert.equal(status.recipients[1].notifiedAt, null);
  c.advance(10 * 60_000);
  assert.equal(c.deliveries.length, 1, 'no further contact is notified');
  assert.equal(c.engine.status(c.escalationId).sosOpen, false);
  assert.equal((await c.post(`/a/${t1}/ack`)).status, 204);
  assert.equal(c.engine.status(c.escalationId).recipients[0].ackedAt, '2026-10-17T05:42:35.000Z', 'a repeat does not move the time');
  const mine = await c.data(c.one);
  assert.equal(mine.status.youAcknowledged, true); assert.deepEqual(mine.status.acknowledgedBy, ['Contact 1']);
});

test('one contact acknowledging is visible to another by name only if they may see the full brief', async t => {
  const c = await setup(t); notifyBoth(c);
  assert.equal((await c.post(`/a/${c.token(c.two)}/ack`)).status, 204);
  const state = c.engine.status(c.escalationId);
  assert.deepEqual(state.recipients.map(r => r.ackedAt !== null), [false, true], 'a token acts only as its own recipient');
  const full = await c.data(c.one), limited = await c.data(c.two);
  assert.equal(full.status.someoneAcknowledged, true); assert.equal(full.status.youAcknowledged, false);
  assert.deepEqual(full.status.acknowledgedBy, ['Contact 2']);
  assert.equal(limited.status.youAcknowledged, true);
  assert.ok(!JSON.stringify((await c.data(c.two)).status).includes('Contact 1'));
});

test('a limited contact learns that someone acknowledged, but not who', async t => {
  const c = await setup(t); notifyBoth(c);
  assert.equal((await c.post(`/a/${c.token(c.one)}/ack`)).status, 204);
  const limited = await c.data(c.two);
  assert.equal(limited.status.someoneAcknowledged, true); assert.equal(limited.status.youAcknowledged, false);
  assert.ok(!JSON.stringify(limited).includes('Contact 1'));
  assert.deepEqual((await c.data(c.one)).status.acknowledgedBy, ['Contact 1']);
});

test('resolve closes the alert for the wearer; a contact without canResolve gets 403 and changes nothing', async t => {
  const c = await setup(t); notifyBoth(c);
  const denied = await c.post(`/a/${c.token(c.two)}/resolve`);
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, 'FORBIDDEN');
  assert.notEqual(c.engine.status(c.escalationId).state, 'resolved');
  assert.equal((await c.data(c.two)).canResolve, false);
  const t1 = c.token(c.one);
  assert.equal((await c.post(`/a/${t1}/resolve`)).status, 204);
  assert.equal(c.engine.status(c.escalationId).state, 'resolved');
  c.advance(10 * 60_000);
  assert.equal(c.deliveries.length, 2, 'the chain stays stopped');
  assert.equal((await c.post(`/a/${t1}/resolve`)).status, 204);
  assert.equal((await c.post(`/a/${t1}/ack`)).status, 204);
  assert.equal(c.engine.status(c.escalationId).state, 'resolved', 'an ack after resolve does not reopen it');
  const closed = await c.data(c.one);
  assert.equal(closed.status.closed, true); assert.equal(closed.status.state, 'resolved');
  assert.equal((await c.data(c.two)).status.closed, true);
});

test('a wearer cancelling after the alert went out closes the contact\'s page', async t => {
  const c = await setup(t); notify(c);
  assert.equal((await c.data(c.one)).status.closed, false);
  c.engine.cancel(c.escalationId, 'safe');
  assert.equal((await c.data(c.one)).status.closed, true);
});

test('duress: same shell, banner data, no call affordance, and permissions still apply', async t => {
  const c = await setup(t, { duress: true });
  assert.equal(c.deliveries[0].duress, true);
  notifyBoth(c);
  const full = await c.data(c.one), limited = await c.data(c.two);
  assert.equal(full.mode, 'duress'); assert.equal(limited.mode, 'duress');
  assert.equal(limited.location, null);
  assert.ok(!/SENTINEL|43\.47/.test(JSON.stringify(limited)));
  for (const data of [full, limited]) assert.ok(!/tel:|\bcall\b|phoneE164|\+1555/i.test(JSON.stringify(data)), 'no number or call link is offered');
  const html = readFileSync(new URL('../public/contact.html', import.meta.url), 'utf8');
  assert.ok(!/tel:|call/i.test(html));
  assert.equal((await c.post(`/a/${c.token(c.one)}/ack`)).status, 204, 'acknowledging still works under duress');
});

test('links die with their session', async t => {
  const c = await setup(t); notifyBoth(c);
  const t1 = c.token(c.one), t2 = c.token(c.two);
  c.sessions.delete(c.sessionId); c.engine.deleteSession(c.sessionId);
  for (const token of [t1, t2]) {
    for (const [method, path] of [['GET', ''], ['GET', '/data'], ['POST', '/ack'], ['POST', '/resolve']])
      assert.equal((await fetch(`${c.base}/a/${token}${path}`, { method })).status, 404);
    assert.equal(c.engine.resolveToken(token), null);
  }
});

test('other methods and paths under /a answer like an unknown link', async t => {
  const c = await setup(t); notify(c);
  const t1 = c.token(c.one);
  for (const [method, path] of [['GET', `/a/${t1}/ack`], ['GET', `/a/${t1}/resolve`], ['POST', `/a/${t1}`],
    ['DELETE', `/a/${t1}`], ['GET', `/a/${t1}/data/extra`], ['GET', '/a'], ['GET', '/a/']]) {
    const response = await fetch(c.base + path, { method });
    assert.equal(response.status, 404, `${method} ${path}`);
    assert.equal(await response.text(), 'This link is not active.');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(c.engine.status(c.escalationId).state, 'notifying', 'none of those acted');
});

test('assets are served with strict headers; nothing outside the assets folder is reachable', async t => {
  const c = await setup(t);
  const js = await c.get('/contact-assets/contact.js');
  assert.equal(js.status, 200); assert.match(js.headers.get('content-type'), /javascript/);
  assert.equal(js.headers.get('x-content-type-options'), 'nosniff');
  const css = await c.get('/contact-assets/contact.css');
  assert.equal(css.status, 200); assert.match(css.headers.get('content-type'), /text\/css/);
  for (const path of ['/contact-assets/nope.js', '/contact-assets/..%2fcontact.html', '/contact-assets/%2e%2e/src/app.js',
    '/contact-assets/..%2f..%2fsrc%2fapp.js', '/contact-assets/']) {
    const response = await c.get(path);
    assert.equal(response.status, 404, path);
    assert.ok(!(await response.text()).includes('createApp'));
  }
});

test('the page script never turns data into markup', () => {
  const source = readFileSync(new URL('../public/assets/contact.js', import.meta.url), 'utf8');
  for (const forbidden of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'setTimeout("', 'srcdoc'])
    assert.ok(!source.includes(forbidden), `contact.js must not use ${forbidden}`);
});

const load = () => {
  const sandbox = {};
  vm.runInNewContext(readFileSync(new URL('../public/assets/contact.js', import.meta.url), 'utf8'), sandbox);
  return sandbox.RaveGuardContact;
};
const data = (extra = {}, status = {}) => ({ mode: 'normal', wearerName: 'Alex', brief: 'Brief.', sinceSeconds: 30,
  location: { mapUrl: 'https://www.google.com/maps/search/?api=1&query=1,2', accuracyM: 12, at: '01:40' }, canResolve: true,
  status: { state: 'notifying', closed: false, youAcknowledged: false, someoneAcknowledged: false, ...status }, ...extra });

test('view model: normal page', () => {
  const { view } = load();
  const v = view(data(), 0);
  assert.deepEqual([v.title, v.banner, v.heading, v.since], ['Guardian alert', '', 'Check on Alex', 'Just now']);
  assert.equal(v.mapHref, 'https://www.google.com/maps/search/?api=1&query=1,2');
  assert.equal(v.accuracy, '±12 m, fix at 01:40');
  assert.deepEqual([v.status, v.ackLabel, v.ackDisabled, v.showResolve], ['No one has acknowledged yet.', "I'm on it", false, true]);
  assert.equal(view(data(), 30).since, '1 minute ago');
  assert.equal(view(data({ sinceSeconds: 600 }), 59).since, '10 minutes ago');
});

test('view model: duress keeps the neutral title, shows the banner and offers no call', () => {
  const { view } = load();
  const v = view(data({ mode: 'duress' }), 0);
  assert.equal(v.title, 'Safety check'); assert.equal(v.banner, 'Do not call or text them openly.');
  assert.ok(!/call:|tel:/i.test(JSON.stringify({ ...v, banner: '' })));
});

test('view model: statuses, permissions and unsafe links', () => {
  const { view } = load();
  assert.equal(view(data({}, { someoneAcknowledged: true }), 0).status, 'Someone has acknowledged.');
  assert.equal(view(data({}, { someoneAcknowledged: true, acknowledgedBy: ['Mum', 'Sam'] }), 0).status, 'Mum, Sam acknowledged.');
  const mine = view(data({}, { youAcknowledged: true }), 0);
  assert.deepEqual([mine.status, mine.ackLabel, mine.ackDisabled], ['You have acknowledged. Please check on Alex.', 'Acknowledged', true]);
  const closed = view(data({}, { closed: true, state: 'resolved' }), 0);
  assert.deepEqual([closed.status, closed.ackDisabled, closed.showResolve], ['This alert has been closed. Thank you.', true, false]);
  assert.equal(view(data({ canResolve: false }), 0).showResolve, false);
  assert.equal(view(data({ location: null }), 0).mapHref, '');
  for (const mapUrl of ['javascript:alert(1)', 'http://www.google.com/maps/x', 'https://evil.example/maps/', 'data:text/html,x'])
    assert.equal(view(data({ location: { mapUrl, accuracyM: 1, at: 'x' } }), 0).mapHref, '', mapUrl);
  assert.equal(view(data({ wearerName: '<img src=x onerror=alert(1)>' }), 0).heading, 'Check on <img src=x onerror=alert(1)>');
});

test('the image ships the page files', () => {
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(dockerfile, /COPY .*public \.\/public/);
});

// AN10: /a/:token/map, the live location link in the SMS.
const mapOf = (c, p) => fetch(`${c.base}/a/${c.token(p)}/map`, { redirect: 'manual' });

test('the map link redirects to the newest fix, and follows the phone as it moves', async t => {
  const c = await setup(t);
  assert.equal((await mapOf(c, c.one)).status, 404, 'dead until that recipient is notified');
  notify(c);
  const first = await mapOf(c, c.one);
  assert.equal(first.status, 302);
  assert.equal(first.headers.get('location'), `https://www.google.com/maps/search/?api=1&query=${SECRET.lat.toFixed(6)},${SECRET.lon.toFixed(6)}`);
  assert.equal(first.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(first.headers.get('cache-control'), 'no-store');
  c.engine.update(c.escalationId, { ...facts(), location: { lat: 43.4801, lon: -80.5302, accuracyM: 8, at: '2026-10-17T05:44:00Z' } });
  const moved = await mapOf(c, c.one);
  assert.equal(moved.headers.get('location'), 'https://www.google.com/maps/search/?api=1&query=43.480100,-80.530200');
});

test('without location permission, or before the first fix, the map link only opens the contact page', async t => {
  const c = await setup(t);
  notifyBoth(c);
  const limited = await mapOf(c, c.two);
  assert.equal(limited.status, 302);
  assert.equal(limited.headers.get('location'), `/a/${c.token(c.two)}`);
  c.engine.update(c.escalationId, { ...facts(), location: null });
  const noFix = await mapOf(c, c.one);
  assert.equal(noFix.headers.get('location'), `/a/${c.token(c.one)}`);
});

test('a bad map link answers like every other dead link', async t => {
  const c = await setup(t);
  notify(c);
  const response = await fetch(`${c.base}/a/${'x'.repeat(22)}/map`, { redirect: 'manual' });
  assert.equal(response.status, 404); assert.equal(await response.text(), 'This link is not active.');
});
