import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSms, smsSegments } from '../src/sms/templates.js';
import { SmsSender } from '../src/sms/sender.js';
import { createTwilioTransport } from '../src/sms/twilio.js';
import { payloadFor } from '../src/brief.js';
const recipient = { phoneE164: '+14165550123' };
const permissions = { receiveAlerts: true, seeLocation: false, seeFullBrief: true, canResolve: true };
const baseFacts = { wearerName: 'Alex', selfDescription: 'black hoodie', lastActiveState: 'dancing', lastActiveUntil: null,
  trigger: { kind: 'fall', at: '2026-10-17T12:00:00Z', reason: 'spike 3.1 g' }, promptsUnanswered: 2, location: null };
// Every SMS input goes through the AN8 projection, exactly as the engine will.
const payload = (perm = {}, view = {}, facts = {}) => payloadFor({ permissions: { ...permissions, ...perm } },
  { facts: { ...baseFacts, ...facts }, deadlineMs: Date.parse('2026-10-17T12:01:10Z'), duress: false, ...view });
const input = (extra = {}) => ({ deliveryId: 'test-delivery', to: recipient.phoneE164, payload: payload(),
  contactUrl: 'https://rg.example/a/abcdefghijklmnopqrstuv', ...extra });
const kinds = { normal: {}, reduced: { payload: payload({ seeFullBrief: false }) },
  duress: { payload: payload({}, { duress: true }) }, 'all-clear': { kind: 'all-clear', at: '2026-10-17T12:05:00Z' } };
const forKind = (kind, extra = {}) => input({ ...kinds[kind], ...extra });
const sid = 'SM' + '1'.repeat(32);

test('all four templates preserve essential content and fit both limits', () => {
  for (const kind of Object.keys(kinds)) {
    const body = renderSms(forKind(kind));
    assert.ok(body.length <= 300); assert.ok(smsSegments(body) <= 2);
    if (kind !== 'all-clear') assert.ok(body.includes(input().contactUrl));
    if (kind === 'duress') assert.match(body, /Do not call or text them openly/);
    if (kind === 'all-clear') assert.match(body, /No action needed/);
    assert.ok(!body.includes('Reply OK'));
  }
});
test('Unicode, long names and GSM extension characters stay within two segments', () => {
  for (const wearerName of ['李'.repeat(100), '😀'.repeat(100), '^'.repeat(100), 'A'.repeat(100)]) {
    for (const kind of Object.keys(kinds)) {
      const named = kind === 'all-clear' ? payload({}, {}, { wearerName }) : payload(
        { seeFullBrief: kind !== 'reduced' }, { duress: kind === 'duress' }, { wearerName });
      const body = renderSms(forKind(kind, { payload: named }));
      assert.ok(body.length <= 300); assert.ok(smsSegments(body) <= 2);
      if (kind !== 'all-clear') assert.ok(body.includes(input().contactUrl));
    }
  }
  assert.equal(smsSegments('a'.repeat(160)), 1);
  assert.equal(smsSegments('a'.repeat(161)), 2);
  assert.equal(smsSegments('^'.repeat(81)), 2);
  assert.equal(smsSegments('^'.repeat(153)), 3);
  assert.equal(smsSegments('😀'.repeat(67)), 3);
  assert.equal(smsSegments('李'.repeat(135)), 3);
  assert.equal(smsSegments('😀'.repeat(68)), 3);
});
test('malformed transports and logger failures cannot cause a repeat send or leak raw errors', async () => {
  for (const value of [undefined, { outcome: 'accepted' }, { outcome: 'unexpected secret' }]) {
    let calls = 0; const logs = [];
    const sender = new SmsSender({ transport: async () => { calls++; return value; }, log: e => logs.push(e) });
    const result = await sender.send(input());
    assert.equal(result.outcome, 'unknown'); assert.equal(calls, 1);
    assert.ok(!JSON.stringify(logs).includes('secret'));
  }
  let calls = 0;
  const sender = new SmsSender({ transport: async () => { calls++; return { outcome: 'accepted', sid, providerStatus: 'queued' }; }, log: () => { throw Error('logger'); } });
  assert.equal((await sender.send(input())).outcome, 'accepted'); assert.equal(calls, 1);
});
test('transport timeout is uncertain and non-retryable', async () => {
  const transport = createTwilioTransport({ accountSid: 'AC'+'a'.repeat(32), authToken: 'secret', from: '+14165550124', timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => { await new Promise(resolve => setTimeout(resolve, 20)); signal.throwIfAborted(); } });
  assert.deepEqual(await transport({ to: recipient.phoneE164, body: 'Test' }), { outcome: 'unknown', retryable: false, code: 'PROVIDER_OUTCOME_UNKNOWN' });
});
test('recipient opt-out sends nothing; restricted recipient gets reduced details, duress remains urgent', () => {
  const secrets = { selfDescription: 'secret', location: { lat: 43.1, lon: -80.5, accuracyM: 9, at: '2026-10-17T12:00:00Z' },
    trigger: { kind: 'fall', at: '2026-10-17T12:00:00Z', reason: 'sensitive' } };
  const restricted = payload({ seeFullBrief: false, seeLocation: true }, {}, secrets);
  const body = renderSms(input({ payload: restricted }));
  assert.match(body, /missed a safety check-in/); assert.ok(!/fall|43\.1|sensitive|secret/i.test(body));
  assert.match(renderSms(input({ payload: payload({ seeFullBrief: false }, { duress: true }, secrets) })), /Do not call or text/);
  assert.equal(renderSms(input({ payload: payloadFor({ permissions: { receiveAlerts: false } }, { facts: baseFacts }) })), null);
});
test('rejects missing permissions, invalid times and unsafe/oversized links', () => {
  assert.throws(() => payloadFor({ phoneE164: recipient.phoneE164 }, { facts: baseFacts, deadlineMs: 0 }), /permissions/);
  assert.throws(() => payloadFor({ permissions: { receiveAlerts: true, seeFullBrief: true } }, { facts: baseFacts, deadlineMs: 0 }), /permissions/);
  assert.throws(() => renderSms(input({ payload: undefined })), /payload/);
  assert.throws(() => renderSms(input({ kind: 'normal' })), /Unknown SMS kind/);
  for (const extra of [{ kind: 'all-clear', at: 'bad' },
    { contactUrl: 'http://rg.example/a/abcdefghijklmnopqrstuv' }, { contactUrl: 'https://user:password@rg.example/a/abcdefghijklmnopqrstuv' },
    { contactUrl: 'https://rg.example/a/abcdefghijklmnopqrstuv?location=secret' }, { contactUrl: 'https://'+'x'.repeat(250)+'.example/a/abcdefghijklmnopqrstuv' }]) {
    assert.throws(() => renderSms(input(extra)));
  }
});
test('sender logs only provider result metadata; coalesces simultaneous identical deliveries', async () => {
  const logs = []; let calls = 0;
  const sender = new SmsSender({ transport: async () => { calls++; return { outcome: 'accepted', sid, providerStatus: 'queued' }; }, log: e => logs.push(e) });
  const results = await Promise.all([sender.send(input()), sender.send(input())]);
  assert.equal(calls, 1); assert.equal(results[0].outcome, 'accepted'); assert.equal(results[1].sid, sid);
  assert.ok(JSON.stringify(logs).includes(sid));
  for (const secret of ['Alex', '14165550123', 'abcdefghijklmnopqrstuv', 'may need help']) assert.ok(!JSON.stringify(logs).includes(secret));
  await assert.rejects(sender.send(input({ payload: payload({}, {}, { wearerName: 'Different' }) })), /deliveryId/);
});
test('safe rejection retries once, but permanent/uncertain outcomes do not retry', async () => {
  let calls = 0; const waits = [];
  const sender = new SmsSender({ transport: async () => ++calls === 1 ? { outcome: 'rejected', retryable: true, code: 'RATE_LIMITED' } : { outcome: 'accepted', sid, providerStatus: 'queued' }, delay: async ms => waits.push(ms) });
  assert.equal((await sender.send(input())).outcome, 'accepted'); assert.equal(calls, 2); assert.deepEqual(waits, [1000]);
  for (const outcome of ['rejected', 'unknown']) {
    calls = 0;
    const s = new SmsSender({ transport: async () => { calls++; return { outcome, retryable: false, code: 'TEST' }; } });
    assert.equal((await s.send(input())).outcome, outcome); await s.send(input()); assert.equal(calls, 1);
  }
});
test('two retryable failures stop at two attempts; opt-outs never reach transport', async () => {
  let calls = 0;
  const sender = new SmsSender({ transport: async () => { calls++; return { outcome: 'rejected', retryable: true, code: 'RATE_LIMITED' }; }, delay: async () => {} });
  assert.equal((await sender.send(input())).outcome, 'rejected'); assert.equal(calls, 2);
  const skipped = await sender.send(input({ deliveryId: 'optout',
    payload: payloadFor({ permissions: { receiveAlerts: false } }, { facts: baseFacts }) }));
  assert.equal(skipped.outcome, 'skipped'); assert.equal(calls, 2);
});
test('Twilio adapter builds bounded form request and distinguishes acceptance from delivery', async () => {
  let request;
  const transport = createTwilioTransport({ accountSid: 'AC'+'a'.repeat(32), authToken: 'test-secret', from: '+14165550124', fetchImpl: async (url, options) => {
    request = { url, options }; return new Response(JSON.stringify({ sid, status: 'queued' }), { status: 201 }); } });
  const result = await transport({ to: recipient.phoneE164, body: 'Synthetic test' });
  assert.equal(result.outcome, 'accepted'); assert.equal(result.providerStatus, 'queued');
  assert.equal(request.url, 'https://api.twilio.com/2010-04-01/Accounts/AC'+'a'.repeat(32)+'/Messages.json');
  assert.equal(request.options.body.get('To'), recipient.phoneE164); assert.equal(request.options.body.get('Body'), 'Synthetic test');
  assert.ok(request.options.headers.Authorization.startsWith('Basic ')); assert.ok(request.options.signal);
});
test('Twilio adapter classifies 429 safe, 400 permanent, 5xx/network/malformed success uncertain', async () => {
  const config = { accountSid: 'AC'+'a'.repeat(32), authToken: 'test-secret', from: '+14165550124' };
  for (const [status, body, outcome, retryable] of [[429, {}, 'rejected', true], [400, {}, 'rejected', false], [500, {}, 'unknown', false], [201, {}, 'unknown', false]]) {
    const transport = createTwilioTransport({ ...config, fetchImpl: async () => new Response(JSON.stringify(body), { status }) });
    const result = await transport({ to: recipient.phoneE164, body: 'Test' });
    assert.equal(result.outcome, outcome); assert.equal(result.retryable, retryable);
  }
  const transport = createTwilioTransport({ ...config, fetchImpl: async () => { throw Error('secret token/body'); } });
  const result = await transport({ to: recipient.phoneE164, body: 'Test' });
  assert.equal(result.outcome, 'unknown'); assert.ok(!JSON.stringify(result).includes('secret'));
});

test('a failed send logs Twilio\'s numeric error code and HTTP status, and nothing that could quote a phone number', async () => {
  const config = { accountSid: 'AC'+'a'.repeat(32), authToken: 'test-secret', from: '+14165550124' };
  const respond = (status, body) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  const unverified = { code: 21608, message: `The number ${recipient.phoneE164} is unverified`, more_info: 'https://x', status: 400 };
  const result = await createTwilioTransport({ ...config, fetchImpl: respond(400, unverified) })({ to: recipient.phoneE164, body: 'Test' });
  assert.deepEqual(result, { outcome: 'rejected', retryable: false, code: 'PROVIDER_REJECTED', httpStatus: 400, providerCode: 21608 });
  assert.ok(!JSON.stringify(result).includes('5550123') && !JSON.stringify(result).includes('unverified'));
  assert.deepEqual(await createTwilioTransport({ ...config, fetchImpl: respond(401, { code: 20003, message: 'Authenticate' }) })({ to: recipient.phoneE164, body: 'Test' }),
    { outcome: 'rejected', retryable: false, code: 'PROVIDER_REJECTED', httpStatus: 401, providerCode: 20003 });
  assert.deepEqual(await createTwilioTransport({ ...config, fetchImpl: respond(429, {}) })({ to: recipient.phoneE164, body: 'Test' }),
    { outcome: 'rejected', retryable: true, code: 'RATE_LIMITED', httpStatus: 429 });
  assert.deepEqual(await createTwilioTransport({ ...config, fetchImpl: respond(503, '<html>down</html>') })({ to: recipient.phoneE164, body: 'Test' }),
    { outcome: 'unknown', retryable: false, code: 'PROVIDER_OUTCOME_UNKNOWN', httpStatus: 503 });
  // Newer trial-account errors have six digits, such as 572006 (predefined templates only).
  const trial = await createTwilioTransport({ ...config, fetchImpl: respond(400, { code: 572006, message: 'Invalid template name.' }) })({ to: recipient.phoneE164, body: 'Test' });
  assert.deepEqual(trial, { outcome: 'rejected', retryable: false, code: 'PROVIDER_REJECTED', httpStatus: 400, providerCode: 572006 });
  for (const bad of [{ code: '21608' }, { code: 5 }, { code: 9999 }, { code: 1000000 }, { code: 99999999 }, { code: 1.5 }, { code: null }, []]) {
    const r = await createTwilioTransport({ ...config, fetchImpl: respond(400, bad) })({ to: recipient.phoneE164, body: 'Test' });
    assert.equal('providerCode' in r, false, JSON.stringify(bad));
  }
  const logs = [];
  const sender = new SmsSender({ log: e => logs.push(e), delay: async () => {},
    transport: createTwilioTransport({ ...config, fetchImpl: respond(400, unverified) }) });
  assert.equal((await sender.send(input())).outcome, 'rejected');
  assert.deepEqual(logs, [{ type: 'sms-attempt', attempt: 1, outcome: 'rejected', code: 'PROVIDER_REJECTED', httpStatus: 400, providerCode: 21608 }]);
  const text = JSON.stringify(logs);
  for (const secret of ['5550123', 'Alex', 'abcdefghijklmnopqrstuv', 'unverified', 'test-secret']) assert.ok(!text.includes(secret));
});

test('every message is branded Guardian', () => {
  for (const kind of Object.keys(kinds)) {
    const body = renderSms(forKind(kind));
    assert.match(body, /^Guardian( URGENT)?: /, body);
    assert.ok(!/raveguard/i.test(body), body);
  }
});

// AN10: the live location link.
const CONTACT = 'https://rg.example/a/abcdefghijklmnopqrstuv';
const MAP = `${CONTACT}/map`;
const located = { seeLocation: true };

test('a recipient who may see location gets the live link in normal, reduced and duress texts', () => {
  for (const p of [payload(located), payload({ ...located, seeFullBrief: false }), payload(located, { duress: true })]) {
    const body = renderSms({ payload: p, contactUrl: CONTACT, mapUrl: MAP });
    assert.ok(body.endsWith(` Live location: ${MAP}`), body);
    assert.ok(body.includes(CONTACT)); assert.ok(smsSegments(body) <= 2 && body.length <= 300);
  }
});

test('no location permission means no live link, even if one is passed', () => {
  for (const p of [payload(), payload({ seeFullBrief: false }), payload({}, { duress: true })]) {
    const body = renderSms({ payload: p, contactUrl: CONTACT, mapUrl: MAP });
    assert.ok(!body.includes('/map') && !body.includes('Live location'), body);
  }
});

test('the all-clear never carries a location link', () => {
  const body = renderSms({ payload: payload(located), kind: 'all-clear', at: '2026-10-17T12:05:00Z', mapUrl: MAP });
  assert.ok(!body.includes('/map'));
});

test('the map link must be the recipient\'s own contact link plus /map', () => {
  for (const bad of [`${CONTACT}/data`, 'https://evil.example/a/abcdefghijklmnopqrstuv/map',
    'https://rg.example/a/zzzzzzzzzzzzzzzzzzzzzz/map', `${MAP}?x=1`])
    assert.throws(() => renderSms({ payload: payload(located), contactUrl: CONTACT, mapUrl: bad }), /map link/);
});

test('on the real host the live link fits with a full name; when it cannot fit, the alert still goes out without it', () => {
  const real = 'https://htv-project-production.up.railway.app/a/' + 'K'.repeat(22);
  const body = renderSms({ payload: payload(located, {}, { wearerName: 'Alexandra Montgomery' }), contactUrl: real, mapUrl: `${real}/map` });
  assert.ok(body.includes('Alexandra Montgomery') && body.endsWith(`Live location: ${real}/map`), body);
  assert.ok(smsSegments(body) <= 2);
  // A 120-character contact link (the template's maximum) leaves no room for a second link.
  const longest = 'https://' + 'h'.repeat(120 - 'https://'.length - '/a/'.length - 22) + '/a/' + 'K'.repeat(22);
  assert.equal(longest.length, 120);
  const fallback = renderSms({ payload: payload(located), contactUrl: longest, mapUrl: `${longest}/map` });
  assert.ok(fallback.includes(longest) && !fallback.includes('/map')); assert.ok(smsSegments(fallback) <= 2);
});
