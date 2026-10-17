import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStack, startEscalation, T0 } from './support/stack.js';
import { clientKey, createRateLimiter, rateLimitFromEnv } from '../src/rate-limit.js';

const DEAD = 'A'.repeat(22);   // a well-formed but unknown link: counts like any other /a request

async function serve(t, { trustProxy = 0, clock = { t: T0 } } = {}) {
  const stack = await makeStack({ clock, listen: true, trustProxy, rateLimit: { now: () => clock.t } });
  t.after(() => stack.die());
  stack.hit = (headers = {}, pathname = `/a/${DEAD}`, method = 'GET') => fetch(stack.base + pathname, { method, headers });
  return stack;
}
const statuses = async (n, call) => { const out = []; for (let i = 0; i < n; i++) out.push((await call()).status); return out; };

test('60 requests per minute are served, the 61st gets 429 with Retry-After and the generic body style', async t => {
  const s = await serve(t);
  const first = await statuses(60, () => s.hit());
  assert.ok(first.every(code => code === 404), 'all 60 reach the normal dead-link answer');
  const blocked = await s.hit();
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');
  assert.match(blocked.headers.get('content-type'), /^text\/plain/);
  assert.equal(await blocked.text(), 'Too many requests. Try again shortly.');
  assert.equal(blocked.headers.get('cache-control'), 'no-store');
  assert.match(blocked.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal((await s.hit()).status, 429, 'it stays blocked inside the window');
});

test('the limit applies to every /a route and method, including valid links', async t => {
  const s = await serve(t);
  const { escalationId, people } = startEscalation(s);
  await s.advance(35_000);
  const link = s.engine.contactToken(escalationId, people[0].id);
  assert.equal((await s.hit({}, `/a/${link}/data`)).status, 200);
  await statuses(58, () => s.hit({}, `/a/${link}/data`));
  assert.equal((await s.hit({}, `/a/${link}`)).status, 200, 'the 60th');
  assert.equal((await s.hit({}, `/a/${link}/ack`, 'POST')).status, 429);
  assert.equal((await s.hit({}, `/a/${link}/resolve`, 'POST')).status, 429);
  assert.equal(s.engine.status(escalationId).recipients[0].ackedAt, null, 'a limited ack did nothing');
  assert.equal((await s.hit({}, '/a/whatever/else', 'DELETE')).status, 429);
});

test('it recovers after the window, and the window slides', async t => {
  const clock = { t: T0 };
  const s = await serve(t, { clock });
  await statuses(60, () => s.hit());
  clock.t += 30_000;
  const mid = await s.hit();
  assert.equal(mid.status, 429);
  assert.equal(mid.headers.get('retry-after'), '30', 'tells the client how long is left');
  clock.t += 29_999;
  assert.equal((await s.hit()).status, 429, 'one millisecond early');
  clock.t += 1;
  assert.equal((await s.hit()).status, 404, 'the window has passed');
  const again = await statuses(59, () => s.hit());
  assert.ok(again.every(code => code === 404));
  assert.equal((await s.hit()).status, 429);
});

test('a limited client does not make other routes unavailable, and assets and /health are not counted', async t => {
  const s = await serve(t);
  await statuses(61, () => s.hit());
  assert.equal((await s.hit()).status, 429);
  assert.equal((await fetch(`${s.base}/health`)).status, 200);
  const assets = await statuses(100, () => s.hit({}, '/contact-assets/contact.css'));
  assert.ok(assets.every(code => code === 200), 'static assets are not rate limited');
  assert.equal((await s.hit({}, '/v1/nope')).status, 404);
});

test('behind one trusted proxy each client address has its own allowance', async t => {
  const s = await serve(t, { trustProxy: 1 });
  const as = ip => s.hit({ 'X-Forwarded-For': ip });
  await statuses(60, () => as('198.51.100.1'));
  assert.equal((await as('198.51.100.1')).status, 429);
  assert.equal((await as('198.51.100.2')).status, 404, 'another client is unaffected');
  assert.equal((await as('2001:db8::1')).status, 404, 'IPv6 is a separate client');
});

test('a spoofed X-Forwarded-For cannot dodge the limit', async t => {
  const s = await serve(t, { trustProxy: 1 });
  // The proxy appends the real address on the right; an attacker can only add entries on the left.
  const codes = [];
  for (let i = 0; i < 61; i++) codes.push((await s.hit({ 'X-Forwarded-For': `10.0.${i}.${i}, 203.0.113.9` })).status);
  assert.equal(codes.filter(c => c === 429).length, 1, 'rotating invented addresses gives no new allowance');
  assert.equal(codes[60], 429);
  const again = await s.hit({ 'X-Forwarded-For': '203.0.113.9' });
  assert.equal(again.status, 429, 'same real address, same bucket, however the header is dressed');
});

test('a spoofed X-Forwarded-For cannot lock out someone else', async t => {
  const s = await serve(t, { trustProxy: 1 });
  const victim = '192.0.2.77';
  // The attacker (real address 203.0.113.9) claims to be the victim and burns far more than the limit.
  await statuses(80, () => s.hit({ 'X-Forwarded-For': `${victim}, 203.0.113.9` }));
  const real = await s.hit({ 'X-Forwarded-For': victim });
  assert.equal(real.status, 404, 'the victim still has their full allowance');
  assert.equal((await s.hit({ 'X-Forwarded-For': `${victim}, 203.0.113.9` })).status, 429, 'only the attacker is blocked');
});

test('with no trusted proxy the header is ignored entirely', async t => {
  const s = await serve(t, { trustProxy: 0 });
  const codes = [];
  for (let i = 0; i < 61; i++) codes.push((await s.hit({ 'X-Forwarded-For': `10.0.0.${i}` })).status);
  assert.equal(codes[60], 429, 'every request came from the same socket address');
});

test('trust proxy accepts only a small hop count, never a boolean that would trust the leftmost entry', async () => {
  const { createApp } = await import('../src/app.js');
  for (const bad of [true, -1, 6, 1.5, '1']) assert.throws(() => createApp({ trustProxy: bad }), /trustProxy/);
  assert.doesNotThrow(() => createApp({ trustProxy: 2 }));
});

test('clientKey: IPv4, mapped IPv4, and IPv6 grouped by /64', () => {
  assert.equal(clientKey('203.0.113.9'), '203.0.113.9');
  assert.equal(clientKey('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(clientKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:0db8:0001:0002::/64');
  assert.equal(clientKey('2001:db8:1:2::1'), clientKey('2001:db8:1:2:ffff::2'), 'rotating inside a /64 gives no new allowance');
  assert.notEqual(clientKey('2001:db8:1:2::1'), clientKey('2001:db8:1:3::1'));
  assert.equal(clientKey('::1'), '0000:0000:0000:0000::/64');
  assert.equal(clientKey('fe80::1%en0'), 'fe80:0000:0000:0000::/64');
  assert.equal(clientKey(undefined), 'unknown');
  assert.equal(clientKey('not an ip'), 'unknown');
});

test('limiter memory is bounded: never more than maxKeys clients and `limit` stamps each', () => {
  let t = 0;
  const limiter = createRateLimiter({ limit: 3, windowMs: 1000, maxKeys: 50, now: () => t });
  for (let i = 0; i < 10_000; i++) limiter.check(`10.${i >> 8}.${i & 255}.1`);
  assert.ok(limiter.size() <= 50);
  for (let i = 0; i < 100; i++) limiter.check('busy');
  assert.equal(limiter.check('busy').allowed, false);
  assert.ok(limiter.size() <= 50);
  t += 1000;
  assert.equal(limiter.check('busy').allowed, true, 'and it recovers');
});

test('CONTACT_RATE_LIMIT_PER_MINUTE: default is the PRD figure, valid values apply, bad ones stop the boot', () => {
  assert.deepEqual(rateLimitFromEnv({}), {});
  assert.deepEqual(rateLimitFromEnv({ CONTACT_RATE_LIMIT_PER_MINUTE: ' ' }), {});
  assert.deepEqual(rateLimitFromEnv({ CONTACT_RATE_LIMIT_PER_MINUTE: '180' }), { limit: 180 });
  assert.deepEqual(rateLimitFromEnv({ CONTACT_RATE_LIMIT_PER_MINUTE: ' 1 ' }), { limit: 1 });
  assert.deepEqual(rateLimitFromEnv({ CONTACT_RATE_LIMIT_PER_MINUTE: '10000' }), { limit: 10000 });
  for (const bad of ['0', '-5', '10001', '1.5', 'many', '1e3', '60 per minute', '0x10', 'Infinity'])
    assert.throws(() => rateLimitFromEnv({ CONTACT_RATE_LIMIT_PER_MINUTE: bad }), /CONTACT_RATE_LIMIT_PER_MINUTE/, bad);
});
