import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeStack, startEscalation, flush, accepted } from './support/stack.js';

// AN13 (restart recovery) x AN14 (late-cancel all-clear): the two features were built separately,
// so these pin how they behave together: a redeploy between the alert and the wearer's check-in.
const C1 = '+15555550101', C2 = '+15555550102';
const ALL_CLEAR = /^Guardian: Alex checked in at \d\d:\d\d\. No action needed\.$/;
const tempDir = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-an13-an14-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
async function boot(t, options = {}) {
  const dir = options.dir ?? tempDir(t);
  const stack = await makeStack({ dir, ...options });
  stack.dir = dir;
  t.after(() => stack.die());
  return stack;
}
async function restart(old, options = {}) { old.die(); return boot({ after() {} }, { dir: old.dir, clock: old.clock, ...options }); }
const clears = stack => stack.sent.filter(m => ALL_CLEAR.test(m.body));
const alerts = stack => stack.sent.filter(m => !ALL_CLEAR.test(m.body));

test('a late cancel after a restart tells the contact who was already texted, once, and re-texts nobody', async t => {
  const before = await boot(t);
  const { escalationId } = startEscalation(before);
  await before.advance(35_000);
  assert.deepEqual(alerts(before).map(m => m.to), [C1]);
  const after = await restart(before);
  await after.advance(5_000);                       // the new process runs, inside Contact 1's window
  after.engine.cancel(escalationId, 'safe');        // the wearer checks in (the phone retried after the redeploy)
  await flush();
  assert.deepEqual(clears(after).map(m => m.to), [C1], 'Contact 1 gets the all-clear');
  assert.equal(alerts(after).length, 0, 'nobody is re-texted by the restart');
  assert.match(clears(after)[0].body, ALL_CLEAR);
  assert.equal(after.engine.status(escalationId).state, 'resolved');
  after.engine.cancel(escalationId, 'safe'); after.engine.cancel(escalationId, 'safe'); await flush();
  assert.equal(clears(after).length, 1, 'replayed cancels add nothing');
  await after.advance(10 * 60_000);
  assert.equal(after.sent.length, 1, 'and the ladder stays stopped');
});

test('a contact reached only by the restored process is also told, and a contact never reached is not', async t => {
  const before = await boot(t);
  const { escalationId } = startEscalation(before);
  await before.advance(35_000);                     // Contact 1 notified by the first process
  const after = await restart(before);
  await after.advance(20_000);                      // Contact 2 notified by the second
  assert.deepEqual(alerts(after).map(m => m.to), [C2]);
  after.engine.cancel(escalationId, 'safe'); await flush();
  assert.deepEqual(clears(after).map(m => m.to).sort(), [C1, C2], 'both contacts who were texted, across the restart');
});

test('a cancel that landed before a restart is not replayed into a second all-clear', async t => {
  const before = await boot(t);
  const { escalationId } = startEscalation(before);
  await before.advance(35_000);
  before.engine.cancel(escalationId, 'safe'); await flush();
  assert.equal(clears(before).length, 1);
  const after = await restart(before);
  after.engine.cancel(escalationId, 'safe');        // the phone never saw the 204 and retries after the redeploy
  await flush();
  assert.equal(after.sent.length, 0, 'the closed state survived, so the retry sends nothing');
  assert.equal(after.engine.status(escalationId).state, 'resolved');
});

test('dying right after the cancel is saved can lose an all-clear but can never send it twice', async t => {
  const hang = new Promise(() => {});
  const before = await boot(t, { transport: async () => hang });   // the all-clear send never completes
  const { escalationId } = startEscalation(before);
  await before.advance(35_000);
  before.engine.cancel(escalationId, 'safe');
  await flush();
  const saved = JSON.parse(fs.readFileSync(path.join(before.dir, 'snapshot.json'), 'utf8'));
  assert.equal(saved.escalations[0].state, 'resolved', 'the closed state was already durable');
  const after = await restart(before);
  after.engine.cancel(escalationId, 'safe'); await after.advance(60_000);
  assert.equal(after.sent.length, 0, 'the new process does not repeat it');
});

test('the duress flag survives a restart, so a safe cancel afterwards is still ignored', async t => {
  const before = await boot(t);
  const { escalationId } = startEscalation(before);
  before.engine.cancel(escalationId, 'duress'); await flush();
  assert.equal(alerts(before).length, 1);
  const after = await restart(before);
  after.engine.cancel(escalationId, 'safe'); await flush();
  assert.equal(after.engine.status(escalationId).state, 'notifying', 'not closed by a safe cancel');
  assert.equal(clears(after).length, 0, 'and no all-clear is ever produced');
  assert.equal(after.sent.length, 0);
});

test('an all-clear to a restored contact still respects the allowlist and the opt-out', async t => {
  const before = await boot(t);
  const { escalationId } = startEscalation(before);
  await before.advance(35_000); await before.advance(20_000); await before.advance(20_000);
  const after = await restart(before);
  after.engine.cancel(escalationId, 'safe'); await flush();
  assert.deepEqual(clears(after).map(m => m.to).sort(), [C1, C2]);
  assert.ok(!after.sent.some(m => m.to === '+15555550103'), 'the opted-out contact is never texted');
});
