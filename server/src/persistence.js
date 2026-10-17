// AN13: restart recovery. One JSON snapshot at $DATA_DIR/snapshot.json, rewritten atomically.
//
// Off unless DATA_DIR is set (then nothing here runs and the server behaves exactly as before).
//
// THE RULE: never text anyone twice. The engine marks a contact notified and calls save() BEFORE it
// starts the send (see EscalationEngine#advance), and save() is synchronous (write temp, fsync,
// rename). So any send that could have started is already recorded as "notified" on disk, and a
// process that dies mid-send comes back believing that contact was texted. The cost of that choice
// is one possibly-unsent SMS after a crash in the milliseconds around a send; the alternative is a
// duplicate SMS to someone about a person in danger. A crash before the rename leaves the old
// snapshot, and in that case no send has started either.
//
// The snapshot holds live contact-link tokens (they are in SMS links and must keep working) and the
// session settings (which hold phone numbers, as they already do in memory), so the file is 0600 and
// the volume must be private. It never holds the session bearer tokens (only their SHA-256 hashes),
// the SMS auth token or any Twilio credential, and escalation records carry no phone numbers (they
// are re-attached from the session on load).
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const VERSION = 1;
const SNAPSHOT = 'snapshot.json';
const iso = z.string().refine(value => Number.isFinite(Date.parse(value)), 'date');
// Deliberately loose about facts and settings: a later schema change must not make an old, healthy
// snapshot look corrupt. These checks only guard what restore relies on.
const sessionShape = z.looseObject({
  sessionId: z.string().min(1), tokenHash: z.string().regex(/^[0-9a-f]{64}$/), createdAt: iso, lastHeartbeatAt: iso,
  wearerName: z.string(), demo: z.boolean(),
  recipients: z.array(z.looseObject({ id: z.string().min(1), phoneE164: z.string(), permissions: z.looseObject({}) }))
});
const recipientShape = z.looseObject({ id: z.string().min(1), token: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  notifiedAt: iso.nullable(), ackedAt: iso.nullable(), permissions: z.looseObject({}) });
const escalationShape = z.looseObject({
  id: z.string().min(1), sessionId: z.string().min(1), deadlineMs: z.number().finite(), deadline: z.string(),
  due: z.number().finite().nullable(),
  state: z.enum(['pending', 'notifying', 'acknowledged', 'resolved', 'cancelled']),
  duress: z.boolean(), sosOpen: z.boolean(), next: z.number().int().min(0), ackWindow: z.number().finite().positive(),
  facts: z.looseObject({ trigger: z.looseObject({ at: iso }) }),
  attempts: z.array(z.looseObject({ recipientId: z.string(), at: iso })),
  recipients: z.array(recipientShape)
});
const snapshotShape = z.looseObject({ version: z.literal(VERSION), savedAt: iso,
  sessions: z.array(sessionShape), escalations: z.array(escalationShape) });

/** Throws with a short reason if the parsed snapshot is unusable (structure or cross-references). */
export function validateSnapshot(data) {
  const parsed = snapshotShape.safeParse(data);
  if (!parsed.success) throw Error(`snapshot shape: ${parsed.error.issues[0]?.path.join('.') || 'root'}`);
  const sessions = new Map();
  for (const s of data.sessions) {
    if (sessions.has(s.sessionId)) throw Error('snapshot has a duplicate session');
    sessions.set(s.sessionId, s);
  }
  const ids = new Set(), tokens = new Set();
  for (const e of data.escalations) {
    if (ids.has(e.id)) throw Error('snapshot has a duplicate escalation');
    ids.add(e.id);
    const session = sessions.get(e.sessionId);
    if (!session) continue;   // orphan of a deleted session: dropped on import
    if (e.next > e.recipients.length) throw Error('snapshot escalation index out of range');
    const known = new Set(session.recipients.map(r => r.id));
    for (const r of e.recipients) {
      if (!known.has(r.id)) throw Error('snapshot escalation names an unknown recipient');
      if (tokens.has(r.token)) throw Error('snapshot has a duplicate link token');
      tokens.add(r.token);
    }
  }
}

/**
 * Loads DATA_DIR's snapshot into `sessions` and `engine` (both must be empty) and wires them to keep
 * it current. Never throws: every failure is logged and reflected in health().
 * snapshot status: 'none' (first boot) | 'loaded' | 'corrupt-moved-aside' | 'unreadable' | 'unavailable'
 */
export function openPersistence({ dir, sessions, engine, log = event => console.log(JSON.stringify(event)),
  now = () => Date.now(), fsApi = fs, heartbeatDelayMs = 1000 }) {
  const file = path.join(dir, SNAPSHOT), temp = `${file}.tmp`;
  const state = { status: 'none', writable: true, lastSaveOk: null, closed: false, dirty: false };
  let timer, lastFailureLog = -Infinity;
  const loud = (type, detail) => log({ type, level: 'error', ...detail });

  try { fsApi.mkdirSync(dir, { recursive: true, mode: 0o700 }); }
  catch (error) {
    state.status = 'unavailable'; state.writable = false;
    loud('snapshot-unavailable', { reason: `DATA_DIR cannot be created (${error.code ?? 'error'}); running WITHOUT persistence` });
  }
  if (state.writable) {
    // A temp file left by a crash mid-write is incomplete by definition; the real snapshot is intact.
    try {
      for (const name of fsApi.readdirSync(dir))
        if (name.startsWith(`${SNAPSHOT}.tmp`)) fsApi.rmSync(path.join(dir, name), { force: true });
    } catch { /* best effort */ }

    let text;
    try { text = fsApi.readFileSync(file, 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') {
        // Cannot read it, so cannot know it is bad: do not risk overwriting it.
        state.status = 'unreadable'; state.writable = false;
        loud('snapshot-unreadable', { reason: `${SNAPSHOT} exists but cannot be read (${error.code ?? 'error'}); persistence DISABLED so it is not overwritten` });
      }
    }
    if (text !== undefined) {
      try {
        const data = JSON.parse(text);
        validateSnapshot(data);
        sessions.importState(data.sessions);
        try { engine.importState(data.escalations); }
        catch (error) { for (const s of data.sessions) sessions.delete(s.sessionId); throw error; }
        state.status = 'loaded';
        const inFlight = data.escalations.flatMap(e => e.attempts).filter(a => !a.failed && a.outcome === undefined).length;
        log({ type: 'snapshot-loaded', sessions: data.sessions.length, escalations: data.escalations.length,
          inFlightSendsKeptNotified: inFlight });
      } catch (error) {
        // Preserve the evidence, start empty, and say so loudly. Never crash-loop on a bad file.
        const aside = `${file}.corrupt-${new Date(now()).toISOString().replace(/[:.]/g, '-')}`;
        state.status = 'corrupt-moved-aside';
        const reason = String(error.message).slice(0, 200);
        try {
          fsApi.renameSync(file, aside);
          loud('snapshot-corrupt', { reason, movedTo: path.basename(aside),
            action: 'started with EMPTY state; the previous sessions and escalations are NOT active' });
        } catch (moveError) {
          state.writable = false;
          loud('snapshot-corrupt', { reason,
            action: `could not move it aside (${moveError.code ?? 'error'}); started EMPTY with persistence DISABLED so it is not overwritten` });
        }
      }
    }
  }

  function save() {
    if (state.closed || !state.writable) return;
    clearTimeout(timer); timer = undefined; state.dirty = false;
    let fd;
    try {
      const body = JSON.stringify({ version: VERSION, savedAt: new Date(now()).toISOString(),
        sessions: sessions.exportState(), escalations: engine.exportState() });
      fd = fsApi.openSync(temp, 'w', 0o600);
      fsApi.writeSync(fd, body);
      fsApi.fsyncSync(fd);
      fsApi.closeSync(fd); fd = undefined;
      fsApi.renameSync(temp, file);
      try { const d = fsApi.openSync(dir, 'r'); try { fsApi.fsyncSync(d); } finally { fsApi.closeSync(d); } }
      catch { /* directory fsync is best effort (not supported everywhere) */ }
      if (state.lastSaveOk === false) log({ type: 'snapshot-save-recovered' });
      state.lastSaveOk = true;
    } catch (error) {
      if (fd !== undefined) try { fsApi.closeSync(fd); } catch { /* ignore */ }
      state.lastSaveOk = false;
      // Alerting beats bookkeeping: a failed save never blocks or crashes the escalation itself.
      if (now() - lastFailureLog >= 10_000) {
        lastFailureLog = now();
        loud('snapshot-save-failed', { reason: `${error.code ?? 'error'}: state is NOT being persisted` });
      }
    }
  }
  if (state.writable) {
    sessions.onChange = kind => {
      if (kind !== 'heartbeat') return save();
      // Heartbeats are frequent and losing a second of one is harmless: coalesce them.
      state.dirty = true;
      if (!timer && !state.closed) {
        timer = setTimeout(() => { timer = undefined; if (state.dirty) save(); }, heartbeatDelayMs);
        timer.unref?.();
      }
    };
    engine.onChange = save;
    save();   // surface an unwritable directory at boot, and record a clean empty/migrated state
  }
  return {
    get status() { return state.status; },
    flush() { if (state.dirty) save(); },
    save,
    close() { state.closed = true; clearTimeout(timer); sessions.onChange = null; engine.onChange = null; },
    /** For /health: no secrets, no paths, nothing that identifies anyone. */
    health: () => ({ snapshot: state.status, lastSaveOk: state.lastSaveOk, writable: state.writable })
  };
}
