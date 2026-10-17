import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../src/sessions.js';

test('heartbeat advances server time, records are isolated, and delete removes personal data', () => {
  let now = new Date('2026-10-17T12:00:00Z');
  const store = new SessionStore({ now: () => now });
  const settings = { wearerName: 'Demo', selfDescription: '', recipients: [], demo: true };
  const { sessionId, token } = store.create(settings);
  settings.wearerName = 'Changed outside';
  assert.equal(store.get(sessionId).wearerName, 'Demo');
  assert.equal(store.get(sessionId).lastHeartbeatAt, now.toISOString());
  now = new Date('2026-10-17T12:00:10Z');
  assert.equal(store.heartbeat(sessionId), true);
  assert.equal(store.get(sessionId).lastHeartbeatAt, now.toISOString());
  assert.equal(store.get(sessionId).createdAt, '2026-10-17T12:00:00.000Z');
  const record = store.get(sessionId);
  assert.ok(!('tokenHash' in record));
  assert.ok(!JSON.stringify(record).includes(token));
  record.recipients.push({ name: 'External mutation' });
  assert.deepEqual(store.get(sessionId).recipients, []);
  store.delete(sessionId);
  assert.equal(store.get(sessionId), undefined);
  assert.equal(store.heartbeat(sessionId), false);
});

test('capacity is bounded and deletion releases capacity', () => {
  const store = new SessionStore({ maxSessions: 1 });
  const first = store.create({});
  assert.equal(store.create({}), null);
  store.delete(first.sessionId);
  assert.ok(store.create({}));
});
