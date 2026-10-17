import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { SessionStore } from '../src/sessions.js';

const settings = { wearerName: 'Synthetic', selfDescription: '', recipients: [], demo: true };
async function serve(t, options) {
  const server = createApp(options).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
const create = base => fetch(`${base}/v1/sessions`, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });

test('capacity returns 503 through HTTP and deletion makes room', async t => {
  const base = await serve(t, { sessions: new SessionStore({ maxSessions: 1 }) });
  const first = await (await create(base)).json();
  const rejected = await create(base);
  assert.equal(rejected.status, 503);
  assert.equal((await rejected.json()).error.code, 'CAPACITY_REACHED');
  assert.equal((await fetch(`${base}/v1/sessions/${first.data.sessionId}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${first.data.token}` }
  })).status, 204);
  assert.equal((await create(base)).status, 201);
});

test('unknown session and wrong bearer scheme do not reveal or mutate stored sessions', async t => {
  let now = new Date('2026-10-17T12:00:00Z');
  const store = new SessionStore({ now: () => now });
  const base = await serve(t, { sessions: store });
  const { data } = await (await create(base)).json();
  const before = store.get(data.sessionId);
  now = new Date('2026-10-17T12:00:10Z');
  for (const [id, authorization] of [[data.sessionId, `Basic ${data.token}`],
    [data.sessionId, `Bearer ${'x'.repeat(43)}`],
    ['00000000-0000-4000-8000-000000000000', `Bearer ${data.token}`]]) {
    const response = await fetch(`${base}/v1/sessions/${id}/heartbeat`, {
      method: 'POST', headers: { Authorization: authorization }
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
    assert.equal((await response.json()).data, null);
    assert.deepEqual(store.get(data.sessionId), before);
  }
  const valid = await fetch(`${base}/v1/sessions/${data.sessionId}/heartbeat`, {
    method: 'POST', headers: { Authorization: `Bearer ${data.token}` }
  });
  assert.equal(valid.status, 204);
  assert.equal(store.get(data.sessionId).lastHeartbeatAt, now.toISOString());
});

test('parallel sessions receive distinct credentials and remain isolated', async t => {
  let now = new Date('2026-10-17T12:00:00Z');
  const store = new SessionStore({ now: () => now });
  const base = await serve(t, { sessions: store });
  const sessions = await Promise.all(Array.from({ length: 20 }, async () => {
    const response = await create(base);
    assert.equal(response.status, 201);
    return (await response.json()).data;
  }));
  assert.equal(new Set(sessions.map(s => s.token)).size, 20);
  assert.equal(new Set(sessions.map(s => s.sessionId)).size, 20);
  const before = sessions.map(s => store.get(s.sessionId));
  now = new Date('2026-10-17T12:01:00Z');
  await Promise.all(sessions.map(async (session, i) => {
    const response = await fetch(`${base}/v1/sessions/${session.sessionId}/heartbeat`, {
      method: 'POST', headers: { Authorization: `Bearer ${sessions[(i + 1) % sessions.length].token}` }
    });
    assert.equal(response.status, 401);
  }));
  assert.deepEqual(sessions.map(s => store.get(s.sessionId)), before);
});

test('restart loses old session credentials until AN13 persistence exists', async t => {
  const first = await serve(t);
  const { data } = await (await create(first)).json();
  const restarted = await serve(t);
  const response = await fetch(`${restarted}/v1/sessions/${data.sessionId}/heartbeat`, {
    method: 'POST', headers: { Authorization: `Bearer ${data.token}` }
  });
  assert.equal(response.status, 401);
});

test('invalid deployment ports fail startup promptly', () => {
  for (const port of ['0', '65536', '-1', 'abc', '3000.5']) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/index.js', import.meta.url))], {
      env: { ...process.env, PORT: port }, encoding: 'utf8', timeout: 5000
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PORT must be an integer from 1 to 65535/);
  }
});
