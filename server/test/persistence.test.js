import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeStack, startEscalation, flush, T0, accepted } from './support/stack.js';

const C1 = '+15555550101', C2 = '+15555550102', C3 = '+15555550103';
const tempDir = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-an13-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const snapshotFile = dir => path.join(dir, 'snapshot.json');
const readSnapshot = dir => JSON.parse(fs.readFileSync(snapshotFile(dir), 'utf8'));
// A restart: the old process is gone (it can neither write nor send), a new one reads the same directory.
async function restart(old, options = {}) { old.die(); return makeStack({ dir: old.dir, clock: old.clock, ...options }); }
async function boot(t, options = {}) {
  const dir = options.dir ?? tempDir(t);
  const stack = await makeStack({ dir, ...options });
  stack.dir = dir;
  t.after(() => stack.die());
  return stack;
}
const notified = (stack, id) => stack.engine.status(id).recipients.map(r => r.notifiedAt !== null);

test('persistence is off without DATA_DIR: no files, no /health change', async t => {
  const stack = await makeStack({ listen: true });
  t.after(() => stack.die());
  startEscalation(stack);
  const health = await (await fetch(`${stack.base}/health`)).json();
  assert.equal('persistence' in health, false);
  assert.equal(stack.persistence, null);
});

test('restart mid-countdown re-arms the deadline and fires Contact 1 exactly once', async t => {
  const a = await boot(t);
  const { escalationId } = startEscalation(a);
  await a.advance(10_000);
  assert.equal(a.sent.length, 0);
  const b = await restart(a); t.after(() => b.die());
  assert.equal(b.engine.status(escalationId).state, 'pending');
  await b.advance(24_000); assert.equal(b.sent.length, 0, 'still before the deadline');
  await b.advance(1_000);
  assert.deepEqual(b.sent.map(m => m.to), [C1]);
  await b.advance(1_000); await b.advance(1_000);
  assert.deepEqual(b.sent.map(m => m.to), [C1], 'a later sweep does not repeat it');
  assert.equal(a.sent.length + b.sent.length, 1);
});

test('a deadline that passed while the server was down fires once, with a fresh window, not a burst', async t => {
  const a = await boot(t);
  const { escalationId } = startEscalation(a);
  const b = await restart(a); t.after(() => b.die());
  b.clock.t += 10 * 60_000;                       // down for ten minutes, deadline long past
  await b.sweep();
  assert.deepEqual(b.sent.map(m => m.to), [C1]);
  await b.sweep(); await b.sweep();
  assert.deepEqual(b.sent.map(m => m.to), [C1], 'Contact 2 is not texted until Contact 1 had a full window');
  await b.advance(20_000);
  assert.deepEqual(b.sent.map(m => m.to), [C1, C2]);
  assert.equal(b.engine.status(escalationId).state, 'notifying');
});

test('restart after Contact 1 was notified does not re-text Contact 1 and continues to Contact 2 on schedule', async t => {
  const a = await boot(t);
  const { escalationId } = startEscalation(a);
  await a.advance(35_000);
  assert.deepEqual(a.sent.map(m => m.to), [C1]);
  await a.advance(8_000);
  const b = await restart(a); t.after(() => b.die());
  assert.deepEqual(notified(b, escalationId), [true, false]);
  await b.sweep(); await b.sweep();
  assert.equal(b.sent.length, 0, 'Contact 1 is not texted again');
  await b.advance(11_000);                         // 19 s into Contact 1's 20 s window
  assert.equal(b.sent.length, 0);
  await b.advance(1_000);                          // the window ends on the original schedule
  assert.deepEqual(b.sent.map(m => m.to), [C2]);
  await b.advance(20_000);                         // SOS opens after the last window
  assert.equal(b.engine.status(escalationId).sosOpen, true);
  assert.equal(a.to(C1) + b.to(C1), 1);
  assert.equal(b.to(C3), 0, 'the opted-out contact is never texted');
});

test('the snapshot on disk already says "notified" at the moment the transport is called (write-ahead)', async t => {
  let seenOnDisk;
  const a = await boot(t, { transport: async () => {
    const e = readSnapshot(a.dir).escalations[0];
    seenOnDisk = { next: e.next, notifiedAt: e.recipients[0].notifiedAt, attempts: e.attempts.length };
    return accepted;
  } });
  startEscalation(a);
  await a.advance(35_000);
  assert.ok(seenOnDisk, 'transport ran');
  assert.equal(seenOnDisk.next, 1);
  assert.equal(seenOnDisk.attempts, 1);
  assert.equal(typeof seenOnDisk.notifiedAt, 'string');
});

test('process killed between "turn started" and "send finished": the contact stays notified and is not re-texted', async t => {
  let started = 0;
  const a = await boot(t, { transport: () => { started++; return new Promise(() => {}); } });   // never finishes
  const { escalationId } = startEscalation(a);
  await a.advance(35_000);
  assert.equal(started, 1);
  const b = await restart(a); t.after(() => b.die());
  assert.deepEqual(notified(b, escalationId), [true, false], 'unknown outcome stays notified');
  assert.equal(b.engine.inspect(escalationId).attempts[0].outcome, 'unknown');
  await b.sweep(); await b.sweep();
  assert.equal(b.sent.length, 0);
  await b.advance(20_000);
  assert.deepEqual(b.sent.map(m => m.to), [C2], 'the ladder continues without repeating Contact 1');
});

test('a real SIGKILL inside the transport leaves a snapshot that prevents a second text', async t => {
  const dir = tempDir(t), sentFile = path.join(dir, 'sent.log');
  const { spawnSync } = await import('node:child_process');
  const child = spawnSync(process.execPath, [new URL('./fixtures/crash-child.js', import.meta.url).pathname, dir, sentFile],
    { encoding: 'utf8', timeout: 20_000 });
  assert.equal(child.signal, 'SIGKILL', `child was killed mid-send (stderr: ${child.stderr})`);
  assert.equal(fs.readFileSync(sentFile, 'utf8'), `${C1}\n`, 'the first process began exactly one send');
  const b = await boot(t, { dir, clock: { t: T0 + 35_000 } });
  const escalationId = readSnapshot(dir).escalations[0].id;
  assert.deepEqual(notified(b, escalationId), [true, false]);
  await b.sweep(); await b.sweep();
  assert.equal(b.sent.length, 0, 'Contact 1 is not texted again after the crash');
  await b.advance(20_000);
  assert.deepEqual(b.sent.map(m => m.to), [C2]);
});

test('a definite rejection is remembered: the rejected contact is not retried after a restart', async t => {
  const a = await boot(t, { transport: async () => ({ outcome: 'rejected', retryable: false, code: 'PROVIDER_REJECTED' }) });
  const { escalationId } = startEscalation(a);
  await a.advance(35_000);
  assert.equal(a.to(C1), 1);
  const b = await restart(a); t.after(() => b.die());
  assert.deepEqual(notified(b, escalationId), [false, false]);
  await b.sweep();
  assert.equal(b.to(C1), 0, 'the chain moved on; Contact 1 is not retried');
  assert.equal(b.to(C2), 1);
});

test('cancelled before anyone was notified stays closed and sends nothing after a restart', async t => {
  const a = await boot(t);
  const { escalationId } = startEscalation(a);
  a.engine.cancel(escalationId, 'safe');
  const b = await restart(a); t.after(() => b.die());
  assert.equal(b.engine.status(escalationId).state, 'cancelled');
  await b.advance(10 * 60_000);
  assert.equal(b.sent.length, 0);
  assert.equal(b.engine.status(escalationId).state, 'cancelled');
  assert.throws(() => b.engine.update(escalationId, a.engine.inspect(escalationId).facts), /closed/);
});

test('resolved and acknowledged stay closed after a restart and never text the next contact', async t => {
  const a = await boot(t);
  const first = startEscalation(a);
  await a.advance(35_000);
  a.engine.resolve(first.escalationId, first.people[0].id);
  const second = startEscalation(a, { deadlineInMs: 1_000 });   // a second wearer, left unresolved but acknowledged
  await a.advance(1_000);
  a.engine.acknowledge(second.escalationId, second.people[0].id);
  const sentBefore = a.sent.length;
  const b = await restart(a); t.after(() => b.die());
  assert.equal(b.engine.status(first.escalationId).state, 'resolved');
  assert.equal(b.engine.status(second.escalationId).state, 'acknowledged');
  await b.advance(10 * 60_000);
  assert.equal(b.sent.length, 0);
  assert.equal(a.sent.length, sentBefore);
  // A closed escalation is not reopened by a late call after the restart.
  b.engine.cancel(first.escalationId, 'duress');
  assert.equal(b.engine.status(first.escalationId).state, 'resolved');
});

test('cancel after Contact 1 was notified (state resolved) survives and Contact 2 is never texted', async t => {
  const a = await boot(t);
  const { escalationId } = startEscalation(a);
  await a.advance(35_000);
  a.engine.cancel(escalationId, 'safe');
  const b = await restart(a); t.after(() => b.die());
  assert.equal(b.engine.status(escalationId).state, 'resolved');
  await b.advance(10 * 60_000);
  assert.equal(b.sent.length, 0);
});

test('duress, idempotency keys, facts and sosOpen survive', async t => {
  const a = await boot(t);
  const key = 'idem-key-0123456789abcdef';
  const { escalationId, sessionId } = startEscalation(a, { key });
  a.engine.cancel(escalationId, 'duress');
  await flush();
  await a.advance(20_000); await a.advance(20_000);
  assert.equal(a.engine.status(escalationId).sosOpen, true);
  const b = await restart(a); t.after(() => b.die());
  const record = b.engine.inspect(escalationId);
  assert.equal(record.duress, true); assert.equal(record.sosOpen, true);
  assert.equal(record.key, key); assert.equal(record.next, 2);
  assert.equal(record.facts.trigger.reason, 'SENTINEL-REASON');
  assert.equal(record.attempts.length, 2);
  assert.equal(b.engine.replayOf(sessionId, key, record.deadline), escalationId, 'a retried register is still recognised');
  await b.advance(10 * 60_000);
  assert.equal(b.sent.length, 0);
});

test('link tokens, session credentials and permissions survive and the page still serves', async t => {
  const a = await boot(t, { listen: true });
  const { escalationId, people, sessionId, token } = startEscalation(a);
  await a.advance(35_000);
  const link1 = a.engine.contactToken(escalationId, people[0].id);
  const link2 = a.engine.contactToken(escalationId, people[1].id);
  assert.equal(a.engine.contactToken(escalationId, people[2].id), undefined);
  assert.equal((await fetch(`${a.base}/a/${link1}`)).status, 200);
  const b = await restart(a, { listen: true }); t.after(() => b.die());
  assert.equal(b.engine.contactToken(escalationId, people[0].id), link1, 'the same token string');
  assert.equal(b.engine.contactToken(escalationId, people[1].id), link2);
  assert.equal((await fetch(`${b.base}/a/${link1}`)).status, 200, 'the link already in an SMS opens after a restart');
  const full = (await (await fetch(`${b.base}/a/${link1}/data`)).json()).data;
  assert.ok(full.location, 'Contact 1 keeps seeLocation');
  assert.match(full.brief, /SENTINEL-REASON/);
  assert.equal((await fetch(`${b.base}/a/${link2}`)).status, 404, 'Contact 2 is still not notified, so still dead');
  await b.advance(20_000);
  const reduced = (await (await fetch(`${b.base}/a/${link2}/data`)).json()).data;
  assert.equal(reduced.location, null, 'Contact 2 keeps the reduced view');
  assert.ok(!JSON.stringify(reduced).includes('SENTINEL'));
  assert.equal((await fetch(`${b.base}/a/${link1}/resolve`, { method: 'POST' })).status, 204, 'canResolve survived');
  assert.equal(b.engine.status(escalationId).state, 'resolved');
  // The wearer's bearer token still authenticates (only its hash was stored).
  const heartbeat = await fetch(`${b.base}/v1/sessions/${sessionId}/heartbeat`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  assert.equal(heartbeat.status, 204);
  const wrong = await fetch(`${b.base}/v1/sessions/${sessionId}/heartbeat`, { method: 'POST', headers: { Authorization: `Bearer ${'x'.repeat(43)}` } });
  assert.equal(wrong.status, 401);
  const status = await fetch(`${b.base}/v1/escalations/${escalationId}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(status.status, 200);
});

test('a closed escalation page and an ended session stay dead across a restart', async t => {
  const a = await boot(t, { listen: true });
  const { escalationId, people, sessionId, token } = startEscalation(a);
  await a.advance(35_000);
  const link = a.engine.contactToken(escalationId, people[0].id);
  const del = await fetch(`${a.base}/v1/sessions/${sessionId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  assert.equal(del.status, 204);
  const b = await restart(a, { listen: true }); t.after(() => b.die());
  assert.equal((await fetch(`${b.base}/a/${link}`)).status, 404);
  assert.equal(b.sessions.get(sessionId), undefined);
  assert.equal(b.engine.owner(escalationId), undefined);
  assert.equal(readSnapshot(a.dir).escalations.length, 0);
});

test('heartbeat times persist (coalesced) and heartbeat does not touch deadlines', async t => {
  const a = await boot(t, { heartbeatDelayMs: 60_000 });
  const { sessionId } = startEscalation(a);
  a.clock.t += 5_000;
  a.sessions.heartbeat(sessionId);
  const stamp = new Date(a.clock.t).toISOString();
  assert.notEqual(readSnapshot(a.dir).sessions[0].lastHeartbeatAt, stamp, 'a heartbeat alone does not rewrite the file');
  a.persistence.flush();
  assert.equal(readSnapshot(a.dir).sessions[0].lastHeartbeatAt, stamp);
  const b = await restart(a); t.after(() => b.die());
  assert.equal(b.sessions.get(sessionId).lastHeartbeatAt, stamp);
});

test('the snapshot never holds a session bearer token or a phone number outside session settings', async t => {
  const a = await boot(t);
  const { token, escalationId } = startEscalation(a);
  await a.advance(35_000);
  const raw = fs.readFileSync(snapshotFile(a.dir), 'utf8');
  assert.ok(!raw.includes(token), 'bearer token is stored only as a hash');
  const data = JSON.parse(raw);
  assert.match(data.sessions[0].tokenHash, /^[0-9a-f]{64}$/);
  assert.ok(data.sessions[0].recipients.some(r => r.phoneE164 === C1), 'session settings already held the number');
  assert.ok(!JSON.stringify(data.escalations).includes('+1555'), 'escalation records carry no phone numbers');
  assert.ok(!raw.includes('TWILIO') && !/SM[0-9a-f]{32}/.test(raw), 'no provider credential or SID');
  assert.equal(a.engine.deliveryTarget(escalationId, data.escalations[0].recipients[0].id).to, C1);
  if (process.platform !== 'win32') assert.equal(fs.statSync(snapshotFile(a.dir)).mode & 0o777, 0o600);
});

test('the restored engine still reaches the right phone number (re-attached from the session)', async t => {
  const a = await boot(t);
  const { escalationId, people } = startEscalation(a);
  const b = await restart(a); t.after(() => b.die());
  assert.equal(b.engine.deliveryTarget(escalationId, people[1].id).to, C2);
});

test('health reports the snapshot state only when persistence is on', async t => {
  const a = await boot(t, { listen: true });
  const health = await (await fetch(`${a.base}/health`)).json();
  assert.deepEqual(health.persistence, { snapshot: 'none', lastSaveOk: true, writable: true });
  const b = await restart(a, { listen: true }); t.after(() => b.die());
  assert.equal((await (await fetch(`${b.base}/health`)).json()).persistence.snapshot, 'loaded');
  assert.ok(!JSON.stringify(health).includes(a.dir), 'no filesystem path in /health');
});

// ----- damaged files -----------------------------------------------------------------------------

async function goodSnapshotText(t) {
  const a = await boot(t);
  startEscalation(a); await a.advance(35_000);
  const text = fs.readFileSync(snapshotFile(a.dir), 'utf8');
  a.die();
  return text;
}
const asideFiles = dir => fs.readdirSync(dir).filter(name => name.startsWith('snapshot.json.corrupt-'));

for (const [name, make] of [
  ['garbage text', () => 'this is not json {{{'],
  ['an empty file', () => ''],
  ['a truncated snapshot', text => text.slice(0, Math.floor(text.length / 2))],
  ['a truncated snapshot (one byte short)', text => text.slice(0, -1)],
  ['JSON that is not an object', () => '[1,2,3]'],
  ['an empty object', () => '{}'],
  ['a snapshot missing its escalations', text => JSON.stringify({ ...JSON.parse(text), escalations: undefined })],
  ['an unknown version', text => JSON.stringify({ ...JSON.parse(text), version: 99 })],
  ['an escalation with a missing field', text => { const d = JSON.parse(text); delete d.escalations[0].next; return JSON.stringify(d); }],
  ['a recipient with a malformed token', text => { const d = JSON.parse(text); d.escalations[0].recipients[0].token = 'short'; return JSON.stringify(d); }],
  ['an escalation naming an unknown recipient', text => { const d = JSON.parse(text); d.escalations[0].recipients[0].id = 'ghost'; return JSON.stringify(d); }],
  ['a duplicated link token', text => { const d = JSON.parse(text); d.escalations[0].recipients[1].token = d.escalations[0].recipients[0].token; return JSON.stringify(d); }],
  ['a session with a bad token hash', text => { const d = JSON.parse(text); d.sessions[0].tokenHash = 'zz'; return JSON.stringify(d); }]
]) {
  test(`${name}: preserved aside with a timestamp, started empty, loud, no crash, and the next boot is clean`, async t => {
    const dir = tempDir(t);
    const damaged = make(await goodSnapshotText(t));
    fs.writeFileSync(snapshotFile(dir), damaged);
    const logs = [];
    const b = await boot(t, { dir, logs, listen: true });
    assert.equal(b.persistence.status, 'corrupt-moved-aside');
    const aside = asideFiles(dir);
    assert.equal(aside.length, 1);
    assert.match(aside[0], /^snapshot\.json\.corrupt-2026-10-17T\d\d-\d\d-\d\d-\d{3}Z$/);
    assert.equal(fs.readFileSync(path.join(dir, aside[0]), 'utf8'), damaged, 'bad bytes preserved exactly');
    const loud = logs.find(e => e.type === 'snapshot-corrupt');
    assert.ok(loud && loud.level === 'error' && /EMPTY/.test(loud.action), 'a clear log line');
    assert.equal(b.sessions.exportState().length, 0); assert.equal(b.engine.exportState().length, 0);
    assert.equal((await (await fetch(`${b.base}/health`)).json()).persistence.snapshot, 'corrupt-moved-aside');
    // It keeps working, writes a fresh snapshot, and the next restart loads that instead of looping.
    startEscalation(b);
    const c = await restart(b, { listen: true }); t.after(() => c.die());
    assert.equal(c.persistence.status, 'loaded');
    assert.equal(asideFiles(dir).length, 1, 'the evidence is kept, not overwritten');
  });
}

test('if the bad snapshot cannot be moved aside it is never overwritten and persistence is disabled', async t => {
  const dir = tempDir(t);
  fs.writeFileSync(snapshotFile(dir), '{ broken');
  const fsApi = { ...fs, renameSync: (from, to) => { if (from.endsWith('snapshot.json')) throw Object.assign(Error('no'), { code: 'EACCES' }); return fs.renameSync(from, to); } };
  const logs = [];
  const b = await boot(t, { dir, logs, fsApi, listen: true });
  startEscalation(b); await b.advance(35_000);
  assert.equal(b.sent.length, 1, 'alerts still work');
  assert.equal(fs.readFileSync(snapshotFile(dir), 'utf8'), '{ broken');
  assert.ok(logs.some(e => e.type === 'snapshot-corrupt' && /could not move it aside/.test(e.action)));
  assert.equal((await (await fetch(`${b.base}/health`)).json()).persistence.writable, false);
});

test('an unreadable snapshot is not overwritten', async t => {
  const dir = tempDir(t);
  fs.mkdirSync(snapshotFile(dir));   // a directory where the file should be: readFileSync fails with EISDIR
  const logs = [];
  const b = await boot(t, { dir, logs });
  assert.equal(b.persistence.status, 'unreadable');
  startEscalation(b); await b.advance(35_000);
  assert.equal(b.sent.length, 1);
  assert.ok(fs.statSync(snapshotFile(dir)).isDirectory());
  assert.ok(logs.some(e => e.type === 'snapshot-unreadable'));
});

test('an unwritable DATA_DIR: loud, never a crash, and alerts still go out', async t => {
  const dir = tempDir(t);
  const blocker = path.join(dir, 'a-file');
  fs.writeFileSync(blocker, 'x');
  const logs = [];
  const b = await boot(t, { dir: path.join(blocker, 'data'), logs, listen: true });   // cannot mkdir below a file
  assert.equal(b.persistence.status, 'unavailable');
  assert.ok(logs.some(e => e.type === 'snapshot-unavailable' && e.level === 'error'));
  startEscalation(b); await b.advance(35_000);
  assert.deepEqual(b.sent.map(m => m.to), [C1]);
  const health = await (await fetch(`${b.base}/health`)).json();
  assert.deepEqual(health.persistence, { snapshot: 'unavailable', lastSaveOk: null, writable: false });
});

test('writes that start failing are logged (rate limited), flagged in health, never block an alert, and recover', async t => {
  const dir = tempDir(t);
  let failing = false;
  const fsApi = { ...fs, openSync: (file, ...rest) => {
    if (failing && String(file).endsWith('.tmp')) throw Object.assign(new Error('disk'), { code: 'ENOSPC' });
    return fs.openSync(file, ...rest);
  } };
  const logs = [];
  const b = await boot(t, { dir, logs, fsApi, listen: true });
  const { escalationId } = startEscalation(b);
  failing = true;
  await b.advance(35_000);
  assert.deepEqual(b.sent.map(m => m.to), [C1], 'the alert goes out even though it could not be saved');
  assert.equal(b.persistence.health().lastSaveOk, false);
  assert.equal(logs.filter(e => e.type === 'snapshot-save-failed').length, 1, 'rate limited to one line per 10 s');
  failing = false;
  await b.advance(20_000);
  assert.equal(b.persistence.health().lastSaveOk, true);
  assert.ok(logs.some(e => e.type === 'snapshot-save-recovered'));
  const c = await restart(b); t.after(() => c.die());
  assert.deepEqual(notified(c, escalationId), [true, true]);
});

test('a failed write leaves the previous snapshot intact and loadable (the rename is the commit)', async t => {
  const dir = tempDir(t);
  let breakRename = false;
  const fsApi = { ...fs, renameSync: (from, to) => {
    if (breakRename) throw Object.assign(new Error('boom'), { code: 'EIO' });
    return fs.renameSync(from, to);
  } };
  const b = await boot(t, { dir, fsApi });
  const { escalationId } = startEscalation(b);
  const before = fs.readFileSync(snapshotFile(dir), 'utf8');
  breakRename = true;
  b.engine.cancel(escalationId, 'safe');
  assert.equal(fs.readFileSync(snapshotFile(dir), 'utf8'), before);
  breakRename = false;
  const c = await restart(b); t.after(() => c.die());
  assert.equal(c.persistence.status, 'loaded');
  assert.equal(c.engine.status(escalationId).state, 'pending', 'the failed save is the only thing lost');
});

test('a stale temp file from a crash mid-write is ignored and cleaned up', async t => {
  const a = await boot(t);
  const { escalationId } = startEscalation(a);
  a.die();
  fs.writeFileSync(`${snapshotFile(a.dir)}.tmp`, '{"version":1,"half written');
  fs.writeFileSync(`${snapshotFile(a.dir)}.tmp-1234`, 'junk');
  const b = await boot(t, { dir: a.dir, clock: a.clock });
  assert.equal(b.persistence.status, 'loaded');
  assert.equal(b.engine.status(escalationId).state, 'pending');
  assert.deepEqual(fs.readdirSync(a.dir).filter(n => n.includes('.tmp')), []);
  assert.equal(asideFiles(a.dir).length, 0, 'a stale temp file is not mistaken for corruption');
});

test('a stale temp file with no snapshot is a clean first boot', async t => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'snapshot.json.tmp'), 'partial');
  const b = await boot(t, { dir });
  assert.equal(b.persistence.status, 'none');
  assert.deepEqual(readSnapshot(dir).sessions, []);
});

test('a snapshot holding an orphan of a deleted session drops it quietly and is not treated as corrupt', async t => {
  const a = await boot(t);
  const { sessionId } = startEscalation(a);
  a.sessions.delete(sessionId);   // session gone, escalation left for the next sweep to drop
  const b = await restart(a); t.after(() => b.die());
  assert.equal(b.persistence.status, 'loaded');
  assert.equal(b.engine.exportState().length, 0);
});

test('persistence file contents are written atomically: no partial snapshot is ever visible at the final path', async t => {
  const dir = tempDir(t);
  const seen = [];
  const fsApi = { ...fs, renameSync: (from, to) => {
    seen.push(JSON.parse(fs.readFileSync(from, 'utf8')).version);   // the temp file is complete before it is renamed
    return fs.renameSync(from, to);
  } };
  const b = await boot(t, { dir, fsApi });
  startEscalation(b); await b.advance(35_000);
  assert.ok(seen.length >= 3 && seen.every(v => v === 1));
});
