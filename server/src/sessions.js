import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const recipient = z.strictObject({
  id: z.uuid(), name: z.string().trim().min(1).max(100),
  phoneE164: z.string().regex(/^\+[1-9]\d{1,14}$/),
  kind: z.enum(['contact', 'venueStaff']), order: z.number().int().min(0).max(1000),
  permissions: z.strictObject({ receiveAlerts: z.boolean(), seeLocation: z.boolean(),
    seeFullBrief: z.boolean(), canResolve: z.boolean() })
});

export const sessionInput = z.strictObject({
  wearerName: z.string().trim().min(1).max(100),
  selfDescription: z.string().trim().max(500),
  recipients: z.array(recipient).max(20).refine(
    items => new Set(items.map(item => item.id.toLowerCase())).size === items.length,
    'Recipient IDs must be unique'),
  demo: z.boolean(),
  // Minutes east of UTC on the wearer's phone, so recipients read local times (-840..840).
  utcOffsetMinutes: z.number().int().min(-840).max(840).optional()
});

// J15: a phone that opted in to being a nearby responder, reporting a coarse fix while its own
// session runs. Validated here; stored rounded (see setResponder).
export const responderInput = z.strictObject({
  name: z.string().trim().min(1).max(100),
  phoneE164: z.string().regex(/^\+[1-9]\d{1,14}$/),
  location: z.strictObject({ lat: z.number().finite().min(-90).max(90), lon: z.number().finite().min(-180).max(180),
    accuracyM: z.number().finite().min(0).max(100000), at: z.iso.datetime({ offset: true }) })
});

// Who counts as nearby, and for how long a responder's fix stays usable.
export const NEARBY = { radiusM: 250, maxAgeMs: 10 * 60_000, limit: 5 };

/** Great-circle distance in metres. */
export function distanceM(a, b) {
  const rad = Math.PI / 180, R = 6_371_000;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const digest = token => createHash('sha256').update(token).digest();

// Process-local storage for AN4. With DATA_DIR set, persistence.js snapshots it (AN13); no watchdog runs here.
export class SessionStore {
  #sessions = new Map();
  // J15: sessionId -> { name, phoneE164, lat, lon, accuracyM, at }. Memory only: never in exportState,
  // so a responder's whereabouts never reach the disk; they re-report within minutes of a restart.
  #responders = new Map();
  // AN13: `onChange(kind)` is set by persistence.js; kind is 'heartbeat' (may be coalesced) or 'change'.
  onChange = null;
  constructor({ now = () => new Date(), maxSessions = 1000 } = {}) {
    this.now = now;
    this.maxSessions = maxSessions;
  }

  create(settings) {
    if (this.#sessions.size >= this.maxSessions) return null;
    const sessionId = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const at = this.now().toISOString();
    this.#sessions.set(sessionId, { ...structuredClone(settings), sessionId,
      tokenHash: digest(token), createdAt: at, lastHeartbeatAt: at });
    this.onChange?.('change');
    return { sessionId, token };
  }

  authenticate(sessionId, authorization) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization ?? '');
    if (!match) return false;
    const session = this.#sessions.get(sessionId);
    return !!session && timingSafeEqual(session.tokenHash, digest(match[1]));
  }

  heartbeat(sessionId) {
    const session = this.#sessions.get(sessionId);
    if (!session) return false;
    session.lastHeartbeatAt = this.now().toISOString();
    this.onChange?.('heartbeat');
    return true;
  }

  /** J15: this session opted in as a nearby responder. Coordinates kept to 3 decimals (~110 m). */
  setResponder(sessionId, { name, phoneE164, location }) {
    if (!this.#sessions.has(sessionId)) return false;
    const round = value => Math.round(value * 1000) / 1000;
    this.#responders.set(sessionId, { sessionId, name, phoneE164, lat: round(location.lat), lon: round(location.lon),
      accuracyM: Math.max(location.accuracyM, 60), at: new Date(location.at).toISOString() });
    return true;
  }
  clearResponder(sessionId) { return this.#responders.delete(sessionId); }

  /** Opted-in responders near `point`, nearest first, excluding a session and phone numbers. */
  nearbyResponders(point, { radiusM = NEARBY.radiusM, maxAgeMs = NEARBY.maxAgeMs, limit = NEARBY.limit,
    excludeSessionId, excludePhones = [] } = {}) {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return [];
    const now = this.now().getTime(), skip = new Set(excludePhones);
    return [...this.#responders.values()]
      .filter(r => r.sessionId !== excludeSessionId && !skip.has(r.phoneE164) && this.#sessions.has(r.sessionId))
      .filter(r => now - Date.parse(r.at) <= maxAgeMs)
      .map(r => ({ ...r, distanceM: distanceM(point, r) }))
      .filter(r => r.distanceM <= radiusM)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, limit)
      .map(({ name, phoneE164, distanceM: d }) => ({ name, phoneE164, distanceM: Math.round(d) }));
  }

  delete(sessionId) {
    this.#responders.delete(sessionId);
    const existed = this.#sessions.delete(sessionId);
    if (existed) this.onChange?.('change');
    return existed;
  }

  // AN13 snapshot seam. The token HASH is stored (hex), never a token: tokens are not kept anywhere.
  exportState() {
    return [...this.#sessions.values()].map(({ tokenHash, ...session }) =>
      ({ ...structuredClone(session), tokenHash: tokenHash.toString('hex') }));
  }
  importState(list) {
    const built = list.map(({ tokenHash, ...session }) =>
      [session.sessionId, { ...structuredClone(session), tokenHash: Buffer.from(tokenHash, 'hex') }]);
    for (const [id, session] of built) this.#sessions.set(id, session);
  }

  // Internal engine seam. Never expose credentials or settings through an HTTP read route.
  get(sessionId) {
    const session = this.#sessions.get(sessionId);
    if (!session) return undefined;
    const { tokenHash, ...record } = session;
    return structuredClone(record);
  }
}
