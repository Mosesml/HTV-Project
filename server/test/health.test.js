import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';

test('health is reachable over HTTP and identifies the scaffold without claiming SMS readiness', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    ok: true,
    service: 'raveguard-escalation',
    stage: 'escalation-simulation',
    notificationsEnabled: false
  });
});

test('health names the serving commit only when the host provides one', async t => {
  const saved = process.env.RAILWAY_GIT_COMMIT_SHA;
  t.after(() => { if (saved === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA; else process.env.RAILWAY_GIT_COMMIT_SHA = saved; });
  const read = async () => {
    const server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
    try { return await (await fetch(`http://127.0.0.1:${server.address().port}/health`)).json(); }
    finally { await new Promise(resolve => server.close(resolve)); }
  };
  delete process.env.RAILWAY_GIT_COMMIT_SHA;
  assert.equal('commit' in await read(), false);
  process.env.RAILWAY_GIT_COMMIT_SHA = '3c09e65f0a1b2c3d4e5f60718293a4b5c6d7e8f9';
  assert.equal((await read()).commit, '3c09e65');
}); 
