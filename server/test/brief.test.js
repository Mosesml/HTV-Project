import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { payloadFor, renderBrief, formatClock, SILENCE_MS } from '../src/brief.js';
import { renderSms } from '../src/sms/templates.js';
import { SessionStore, sessionInput } from '../src/sessions.js';
import { EscalationEngine } from '../src/escalations.js';

// Values that appear nowhere else, so finding one in output proves a leak.
const SECRET = { description: 'SENTINEL-HOODIE', reason: 'SENTINEL-REASON', lat: 43.472391, lon: -80.544913,
  accuracy: 17.3, extra: 'SENTINEL-EXTRA-FIELD' };
const deadlineMs = Date.parse('2026-10-17T05:44:10Z');
const facts = (extra = {}) => ({ wearerName: 'Alex', selfDescription: SECRET.description,
  lastActiveState: 'dancing', lastActiveUntil: '2026-10-17T05:41:30Z',
  trigger: { kind: 'fall', at: '2026-10-17T05:42:00Z', reason: SECRET.reason, posture: { pitchDeg: 70, rollDeg: 4 } },
  promptsUnanswered: 7,
  location: { lat: SECRET.lat, lon: SECRET.lon, accuracyM: SECRET.accuracy, at: '2026-10-17T05:40:15Z' },
  ...extra });
const view = (extra = {}) => ({ facts: facts(), deadlineMs, duress: false, utcOffsetMinutes: -240,
  lastHeartbeatAt: '2026-10-17T05:43:10Z', now: Date.parse('2026-10-17T05:44:10Z'), ...extra });
const perms = (receiveAlerts, seeLocation, seeFullBrief, canResolve) => ({ receiveAlerts, seeLocation, seeFullBrief, canResolve });
const url = 'https://rg.example/a/abcdefghijklmnopqrstuv';
const bools = [false, true];
const combos = bools.flatMap(a => bools.flatMap(l => bools.flatMap(f => bools.map(r => perms(a, l, f, r)))));

const LOCATION_TELLS = [String(SECRET.lat), String(SECRET.lon), '43.47', '80.54', 'maps', 'accuracy', '"lat"', '"lon"'];
const FULL_BRIEF_TELLS = [SECRET.description, SECRET.reason, 'dancing', 'Fall detected', '7 check-in', 'unanswered', 'silent',
  'spike', 'posture', 'pitch', '05:42', '01:42', '01:41'];

test('all 16 permission combinations, normal and duress, with and without a fix or a silent phone', () => {
  assert.equal(combos.length, 16);
  let checked = 0;
  for (const permissions of combos) for (const duress of bools) for (const withFix of bools) for (const silent of bools) {
    const v = view({ duress, facts: facts(withFix ? {} : { location: null }),
      lastHeartbeatAt: silent ? '2026-10-17T05:43:10Z' : '2026-10-17T05:44:05Z' });
    const payload = payloadFor({ permissions }, v);
    if (!permissions.receiveAlerts) { assert.equal(payload, null); continue; }
    const outputs = [JSON.stringify(payload), renderBrief(payload), renderSms({ payload, contactUrl: url })];
    for (const text of outputs) {
      if (!permissions.seeLocation) for (const tell of LOCATION_TELLS)
        assert.ok(!text.toLowerCase().includes(tell), `${JSON.stringify(permissions)} leaked ${tell} in ${text}`);
      if (!permissions.seeFullBrief) for (const tell of FULL_BRIEF_TELLS)
        assert.ok(!text.includes(tell), `${JSON.stringify(permissions)} leaked "${tell}" in ${text}`);
    }
    // Location is its own switch: present only when permitted and the phone sent a fix.
    assert.equal('location' in payload, permissions.seeLocation && withFix);
    if (permissions.seeLocation && withFix) assert.equal(payload.location.lat, SECRET.lat);
    // The brief text never carries coordinates, whatever the permission.
    assert.ok(!renderBrief(payload).includes('43.47'));
    assert.equal(payload.variant, permissions.seeFullBrief ? 'full' : 'reduced');
    assert.equal(payload.mode, duress ? 'duress' : 'normal');
    assert.equal(payload.canResolve, permissions.canResolve);
    checked++;
  }
  assert.equal(checked, 8 * 2 * 2 * 2);
});

test('the payload is built from a whitelist: exact keys per variant, and unknown facts never appear', () => {
  const hostile = facts({ internalNote: SECRET.extra, phoneE164: '+15555550199' });
  hostile.trigger.secretTrace = SECRET.extra;
  hostile.location.indoorFloor = SECRET.extra;
  const base = ['canResolve', 'missedAt', 'mode', 'utcOffsetMinutes', 'variant', 'wearerName'];
  const fullKeys = [...base, 'lastActive', 'phoneSilentSince', 'promptsUnanswered', 'selfDescription', 'trigger'].sort();
  const keys = (permissions) => Object.keys(payloadFor({ permissions, phoneE164: '+15555550123', name: 'Primary' }, view({ facts: hostile }))).sort();
  assert.deepEqual(keys(perms(true, false, false, true)), base);
  // AN10: `locationShared` marks a recipient who gets the live location link; never without seeLocation.
  assert.deepEqual(keys(perms(true, true, false, false)), [...base, 'location', 'locationShared'].sort());
  assert.deepEqual(keys(perms(true, false, true, true)), fullKeys);
  assert.deepEqual(keys(perms(true, true, true, true)), [...fullKeys, 'location', 'locationShared'].sort());
  const payload = payloadFor({ permissions: perms(true, true, true, true) }, view({ facts: hostile }));
  assert.deepEqual(Object.keys(payload.location).sort(), ['accuracyM', 'at', 'lat', 'lon', 'mapUrl']);
  assert.deepEqual(Object.keys(payload.trigger).sort(), ['at', 'kind', 'label', 'reason']);
  assert.ok(!JSON.stringify(payload).includes(SECRET.extra));
  assert.ok(!JSON.stringify(payload).includes('5555550199'));
});

test('the payload is frozen and the recipient and escalation are never mutated', () => {
  const v = view(); const r = { permissions: perms(true, true, true, true), phoneE164: '+15555550123' };
  const before = JSON.stringify([v, r]);
  const payload = payloadFor(r, v);
  assert.equal(JSON.stringify([v, r]), before);
  assert.ok(Object.isFrozen(payload) && Object.isFrozen(payload.location) && Object.isFrozen(payload.trigger));
  assert.throws(() => { payload.location.lat = 0; }, TypeError);
});

test('missing or partial permissions fail closed; an opt-out returns nothing', () => {
  for (const bad of [undefined, {}, { permissions: undefined }, { permissions: { receiveAlerts: true } },
    { permissions: { receiveAlerts: true, seeLocation: true, seeFullBrief: true } },
    { permissions: { receiveAlerts: 'yes', seeLocation: false, seeFullBrief: false, canResolve: false } }])
    assert.throws(() => payloadFor(bad, view()), /permissions/);
  assert.equal(payloadFor({ permissions: { receiveAlerts: false } }, view()), null);
});

test('brief text matches the template word for word, full and reduced', () => {
  const full = payloadFor({ permissions: perms(true, false, true, true) }, view());
  assert.equal(renderBrief(full),
    'Alex (SENTINEL-HOODIE) was dancing until 01:41. Fall detected at 01:42: SENTINEL-REASON. ' +
    '7 check-in prompts went unanswered. Phone went silent at 01:43.');
  const reduced = payloadFor({ permissions: perms(true, true, false, false) }, view());
  assert.equal(renderBrief(reduced), 'Alex missed a safety check-in at 01:44.');
  const example = payloadFor({ permissions: perms(true, false, true, true) }, view({
    facts: facts({ selfDescription: 'black hoodie, white cap', promptsUnanswered: 1,
      trigger: { kind: 'fall', at: '2026-10-17T05:42:00Z', reason: 'spike 3.1 g, head 70° sideways, still 12 s' } }),
    lastHeartbeatAt: '2026-10-17T05:44:05Z' }));
  assert.equal(renderBrief(example),
    'Alex (black hoodie, white cap) was dancing until 01:41. Fall detected at 01:42: spike 3.1 g, head 70° sideways, still 12 s. ' +
    '1 check-in prompt went unanswered.');
});

test('brief text copes with missing facts', () => {
  const sparse = payloadFor({ permissions: perms(true, false, true, true) }, view({
    facts: facts({ selfDescription: '', lastActiveState: 'unknown', lastActiveUntil: null, promptsUnanswered: 0,
      trigger: { kind: 'manual', at: '2026-10-17T05:42:00Z', reason: 'Manual test' }, location: null }),
    lastHeartbeatAt: '2026-10-17T05:44:05Z' }));
  assert.equal(renderBrief(sparse), 'Alex. Safety check-in at 01:42: Manual test.');
  assert.equal(payloadFor({ permissions: perms(true, true, true, true) }, view({ facts: facts({ location: null }) })).location, undefined);
});

test('free text from the phone is cleaned and bounded; markup stays inert text', () => {
  const messy = payloadFor({ permissions: perms(true, false, true, true) }, view({ facts: facts({
    wearerName: '  ‮Al\u0000ex\n  Smith ', selfDescription: '<img src=x onerror=alert(1)>'.repeat(30),
    trigger: { kind: 'fall', at: '2026-10-17T05:42:00Z', reason: 'a​\u0007b'.repeat(500) } }) }));
  assert.equal(messy.wearerName, 'Al ex Smith');
  assert.ok(Array.from(messy.selfDescription).length <= 200 && messy.selfDescription.endsWith('…'));
  assert.ok(Array.from(messy.trigger.reason).length <= 200);
  assert.ok(!/[\p{Cc}\p{Cf}]/u.test(JSON.stringify(Object.values(messy.trigger)) + messy.wearerName));
  assert.equal(payloadFor({ permissions: perms(true, false, false, true) }, view({ facts: facts({ wearerName: '‮ \u0000' }) })).wearerName, 'The wearer');
  const odd = payloadFor({ permissions: perms(true, false, true, true) }, view({ facts: facts({ lastActiveState: 'nonsense',
    trigger: { kind: 'bogus', at: '2026-10-17T05:42:00Z', reason: 'x' }, promptsUnanswered: -3 }) }));
  assert.deepEqual([odd.lastActive.state, odd.trigger.kind, odd.promptsUnanswered], ['unknown', 'manual', 0]);
});

test('times are in the wearer\'s local zone, or labelled UTC when no offset was sent', () => {
  assert.equal(formatClock('2026-10-17T05:42:00Z', -240), '01:42');
  assert.equal(formatClock('2026-10-17T02:30:00Z', -240), '22:30');       // previous day
  assert.equal(formatClock('2026-10-17T05:42:00Z', 330), '11:12');        // half-hour zone
  assert.equal(formatClock('2026-10-17T23:50:00Z', 840), '13:50');
  assert.equal(formatClock('2026-10-17T05:42:00Z', undefined), '05:42 UTC');
  assert.equal(formatClock(Date.parse('2026-10-17T05:42:59.999Z'), 0), '05:42');
  assert.throws(() => formatClock('not a time', 0), /Invalid time/);
  const local = payloadFor({ permissions: perms(true, true, true, true) }, view());
  assert.deepEqual([local.missedAt, local.trigger.at, local.lastActive.until, local.location.at, local.phoneSilentSince],
    ['01:44', '01:42', '01:41', '01:40', '01:43']);
  assert.equal(local.utcOffsetMinutes, -240);
  const utc = payloadFor({ permissions: perms(true, false, true, true) }, view({ utcOffsetMinutes: undefined }));
  assert.deepEqual([utc.missedAt, utc.trigger.at], ['05:44 UTC', '05:42 UTC']);
  assert.equal(utc.utcOffsetMinutes, null);
  assert.match(renderSms({ payload: local, contactUrl: url }), /Fall detected at 01:42;/);
  assert.match(renderSms({ payload: payloadFor({ permissions: perms(true, false, false, true) }, view()), contactUrl: url }), /missed a safety check-in at 01:44\./);
  assert.match(renderSms({ payload: local, kind: 'all-clear', at: '2026-10-17T05:46:00Z' }), /checked in at 01:46\./);
  assert.match(renderSms({ payload: utc, kind: 'all-clear', at: '2026-10-17T05:46:00Z' }), /checked in at 05:46 UTC\./);
});

test('a phone is silent only after missing heartbeats; fresh or unknown heartbeats say nothing', () => {
  const at = ago => ({ lastHeartbeatAt: new Date(deadlineMs - ago).toISOString(), now: deadlineMs });
  const silent = ago => payloadFor({ permissions: perms(true, false, true, true) }, view(at(ago))).phoneSilentSince;
  assert.equal(silent(5_000), null);
  assert.equal(silent(SILENCE_MS), null);
  assert.equal(silent(SILENCE_MS + 1_000), '01:43');
  assert.equal(payloadFor({ permissions: perms(true, false, true, true) }, view({ lastHeartbeatAt: undefined })).phoneSilentSince, null);
  assert.equal(payloadFor({ permissions: perms(true, false, true, true) }, view({ now: undefined })).phoneSilentSince, null);
});

test('session settings accept an optional local offset in range', () => {
  const settings = { wearerName: 'A', selfDescription: '', recipients: [], demo: true };
  assert.ok(sessionInput.safeParse(settings).success);
  for (const utcOffsetMinutes of [-840, -240, 0, 330, 840]) assert.ok(sessionInput.safeParse({ ...settings, utcOffsetMinutes }).success);
  for (const utcOffsetMinutes of [-841, 841, 1.5, '60', null, NaN]) assert.ok(!sessionInput.safeParse({ ...settings, utcOffsetMinutes }).success);
});

test('engine.view applies the recipient\'s own permissions to the stored escalation', () => {
  let clock = Date.parse('2026-10-17T05:42:00Z');
  const sessions = new SessionStore({ now: () => new Date(clock) });
  const engine = new EscalationEngine({ sessions, now: () => clock });
  const person = (id, name, order, permissions) => ({ id, name, phoneE164: `+1555555010${order}`, kind: 'contact', order, permissions });
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
  const { sessionId } = sessions.create({ wearerName: 'Alex', selfDescription: '', demo: true, utcOffsetMinutes: -240, recipients: [
    person(ids[0], 'Contact 1', 0, perms(true, true, true, true)),
    person(ids[1], 'Contact 2', 1, perms(true, false, false, false)),
    person(ids[2], 'Opted out', 2, perms(false, true, true, true))] });
  const id = engine.register(sessionId, new Date(clock + 35_000).toISOString(), facts());
  clock += 35_000;
  const one = engine.view(id, ids[0]);
  const two = engine.view(id, ids[1]);
  assert.equal(one.variant, 'full'); assert.equal(one.location.lat, SECRET.lat); assert.equal(one.canResolve, true);
  assert.equal(two.variant, 'reduced'); assert.equal('location' in two, false); assert.equal(two.canResolve, false);
  assert.equal(one.missedAt, '01:42'); assert.equal(one.phoneSilentSince, '01:42');
  assert.ok(!JSON.stringify(two).match(/SENTINEL|43\.47|dancing/));
  assert.equal(engine.view(id, ids[2]), null, 'an opted-out recipient has no view');
  assert.equal(engine.view(id, '99999999-9999-4999-8999-999999999999'), null);
  assert.throws(() => engine.view('00000000-0000-4000-8000-000000000000', ids[0]), /not found/i);
  sessions.heartbeat(sessionId);
  assert.equal(engine.view(id, ids[0]).phoneSilentSince, null, 'a fresh heartbeat clears the silence note');
  engine.cancel(id, 'duress');
  assert.equal(engine.view(id, ids[1]).mode, 'duress');
  sessions.delete(sessionId);
  assert.throws(() => engine.view(id, ids[0]), /not found/i);
});

test('only brief.js and the settings schema know the permission names; SMS never reads permissions', () => {
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  const files = readdirSync(src, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => `${entry.parentPath.slice(src.length)}${entry.parentPath.length > src.length ? '/' : ''}${entry.name}`);
  const knowers = files.filter(file => /seeLocation|seeFullBrief/.test(readFileSync(src + file, 'utf8'))).sort();
  assert.deepEqual(knowers, ['brief.js', 'sessions.js']);
  assert.ok(!/permissions/.test(readFileSync(src + 'sms/templates.js', 'utf8')));
  assert.ok(!/facts|permissions/.test(readFileSync(src + 'sms/sender.js', 'utf8')));
});
