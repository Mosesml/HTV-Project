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

const digest = token => createHash('sha256').update(token).digest();

// Process-local storage for AN4. With DATA_DIR set, persistence.js snapshots it (AN13); no watchdog runs here.
export class SessionStore {
  #sessions = new Map();
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

  delete(sessionId) {
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
