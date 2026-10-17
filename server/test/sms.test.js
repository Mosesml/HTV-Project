import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSms, smsSegments } from '../src/sms/templates.js';
import { SmsSender } from '../src/sms/sender.js';
import { createTwilioTransport } from '../src/sms/twilio.js';
const recipient = { phoneE164: '+14165550123', permissions: { receiveAlerts: true, seeLocation: false, seeFullBrief: true, canResolve: true } };
const input = (extra = {}) => ({ deliveryId: 'test-delivery', recipient, kind: 'normal', wearerName: 'Alex',
  at: '2026-10-17T12:00:00Z', triggerKind: 'fall', promptsUnanswered: 2,
  contactUrl: 'https://rg.example/a/abcdefghijklmnopqrstuv', ...extra });
const sid = 'SM' + '1'.repeat(32);

test('all four templates preserve essential content and fit both limits', () => {
  for (const kind of ['normal', 'reduced', 'duress', 'all-clear']) {
    const body = renderSms(input({ kind }));
    assert.ok(body.length <= 300); assert.ok(smsSegments(body) <= 2);
    if (kind !== 'all-clear') assert.ok(body.includes(input().contactUrl));
    if (kind === 'duress') assert.match(body, /Do not call or text them openly/);
    if (kind === 'all-clear') assert.match(body, /No action needed/);
    assert.ok(!body.includes('Reply OK'));
  }
});
test('Unicode, long names and GSM extension characters stay within two segments', () => {
  for (const wearerName of ['李'.repeat(100), '😀'.repeat(100), '^'.repeat(100), 'A'.repeat(100)]) {
    for (const kind of ['normal', 'reduced', 'duress', 'all-clear']) {
      const body = renderSms(input({ wearerName, kind }));
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
  const restricted = { ...recipient, permissions: { ...recipient.permissions, seeFullBrief: false } };
  const body = renderSms(input({ recipient: restricted, location: { lat: 43.1 }, reason: 'sensitive', selfDescription: 'secret' }));
  assert.match(body, /missed a safety check-in/); assert.ok(!/fall|43.1|sensitive|secret/.test(body));
  assert.match(renderSms(input({ recipient: restricted, kind: 'duress' })), /Do not call or text/);
  assert.equal(renderSms(input({ recipient: { ...recipient, permissions: { receiveAlerts: false } } })), null);
});
test('rejects missing permissions, invalid times and unsafe/oversized links', () => {
  for (const extra of [{ recipient: { phoneE164: recipient.phoneE164 } }, { at: 'bad' },
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
  await assert.rejects(sender.send(input({ wearerName: 'Different' })), /deliveryId/);
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
  const skipped = await sender.send(input({ deliveryId: 'optout', recipient: { ...recipient, permissions: { receiveAlerts: false } } }));
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
