import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';

const payload = () => ({
  wearerName: 'Demo wearer', selfDescription: 'Blue jacket', demo: true,
  recipients: [{ id: 'f4a94c98-0c17-4ab3-bd04-d7f40f5ad782', name: 'Demo contact',
    phoneE164: '+14165550123', kind: 'contact', order: 0,
    permissions: { receiveAlerts: true, seeLocation: false, seeFullBrief: false, canResolve: true } }]
});

async function client(t) {
  const server = createApp().listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  return (path, method = 'POST', body, token) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function start(request) {
  const response = await request('/v1/sessions', 'POST', payload());
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.error, null);
  assert.match(result.data.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(result.data.sessionId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(Object.keys(result.data).sort(), ['sessionId', 'token']);
  return result.data;
}

test('create, heartbeat and delete; deleted credentials cannot be reused', async t => {
  const request = await client(t);
  const { sessionId, token } = await start(request);
  for (const [path, method] of [[`/v1/sessions/${sessionId}/heartbeat`, 'POST'], [`/v1/sessions/${sessionId}`, 'DELETE']]) {
    const response = await request(path, method, undefined, token);
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
  }
  const deleted = await request(`/v1/sessions/${sessionId}/heartbeat`, 'POST', undefined, token);
  assert.equal(deleted.status, 401);
});

test('missing, incorrect, and another session’s tokens cannot mutate a session', async t => {
  const request = await client(t);
  const first = await start(request);
  const second = await start(request);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.sessionId, second.sessionId);
  for (const token of [undefined, 'bad', second.token]) {
    for (const [path, method] of [[`/v1/sessions/${first.sessionId}/heartbeat`, 'POST'], [`/v1/sessions/${first.sessionId}`, 'DELETE']]) {
      const response = await request(path, method, undefined, token);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { ok: false, data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid session credentials' } });
    }
  }
  assert.equal((await request(`/v1/sessions/${first.sessionId}/heartbeat`, 'POST', undefined, first.token)).status, 204);
});

test('invalid settings and ambiguous recipient identifiers are rejected without echoing personal data', async t => {
  const request = await client(t);
  const invalid = [null, {}, { ...payload(), wearerName: ' ' }, { ...payload(), demo: 'true' },
    { ...payload(), selfDescription: 'x'.repeat(501) },
    { ...payload(), recipients: [ { ...payload().recipients[0], phoneE164: '4165550123' } ] },
    { ...payload(), recipients: [ { ...payload().recipients[0], permissions: { seeLocation: true } } ] },
    { ...payload(), recipients: [payload().recipients[0], payload().recipients[0]] },
    { ...payload(), unexpected: 'do not store' }];
  for (const input of invalid) {
    const response = await request('/v1/sessions', 'POST', input);
    assert.equal(response.status, 400);
    const result = await response.json();
    assert.equal(result.ok, false);
    assert.equal(result.data, null);
    assert.equal(result.error.code, 'INVALID_REQUEST');
    assert.ok(!JSON.stringify(result).includes('+14165550123'));
  }
});

test('empty recipient list is allowed for setup parity with the offline fake', async t => {
  const request = await client(t);
  assert.equal((await request('/v1/sessions', 'POST', { ...payload(), recipients: [] })).status, 201);
});

test('malformed JSON, oversized bodies and unknown routes produce bounded JSON errors', async t => {
  const server = createApp().listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [body, status, code] of [['{', 400, 'INVALID_REQUEST'], [JSON.stringify({ text: 'x'.repeat(33000) }), 413, 'BODY_TOO_LARGE']]) {
    const response = await fetch(`${base}/v1/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, status);
    assert.equal((await response.json()).error.code, code);
  }
  const missing = await fetch(`${base}/v1/missing`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'NOT_FOUND');
});
