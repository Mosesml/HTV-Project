// AN13: a small in-memory sliding-window rate limiter for the public contact page (/a/*).
//
// Dependency-free and bounded: at most `limit` timestamps per client and at most `maxKeys` clients
// are ever held, so a flood of distinct addresses cannot grow memory without bound. When the table is
// full the least recently seen client is forgotten (it merely gets a fresh allowance).
//
// Which "client"? The key is Express's `request.ip`. See clientKey() and createApp's `trustProxy`
// for why that is not spoofable through X-Forwarded-For.
import net from 'node:net';

/**
 * Normalises an address into a limiter key. IPv4-mapped IPv6 (::ffff:1.2.3.4) is the IPv4 address,
 * and an IPv6 client is keyed by its /64, because a single subscriber normally owns a whole /64 and
 * could otherwise dodge the limit by rotating addresses inside it.
 */
export function clientKey(ip) {
  if (typeof ip !== 'string' || !ip) return 'unknown';
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  if (net.isIPv4(ip)) return ip;
  if (!net.isIPv6(ip)) return 'unknown';
  const bare = ip.split('%')[0].toLowerCase();
  const [head, tail = ''] = bare.split('::');
  const first = head ? head.split(':') : [], last = tail ? tail.split(':') : [];
  const groups = bare.includes('::') ? [...first, ...Array(8 - first.length - last.length).fill('0'), ...last] : first;
  return `${groups.slice(0, 4).map(g => g.padStart(4, '0')).join(':')}::/64`;
}

export function createRateLimiter({ limit = 60, windowMs = 60_000, maxKeys = 10_000, now = () => Date.now() } = {}) {
  const hits = new Map();   // key -> ascending timestamps of ALLOWED requests; Map order = least recently seen first
  function check(key) {
    const t = now(), cutoff = t - windowMs;
    let stamps = hits.get(key) ?? [];
    while (stamps.length && stamps[0] <= cutoff) stamps.shift();
    hits.delete(key);   // re-insert below so Map order stays least-recently-seen first
    if (stamps.length >= limit) {
      hits.set(key, stamps);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((stamps[0] + windowMs - t) / 1000)) };
    }
    stamps.push(t); hits.set(key, stamps);
    while (hits.size > maxKeys) {
      const oldest = hits.keys().next().value;
      hits.delete(oldest);
    }
    return { allowed: true };
  }
  /** Express middleware. `onLimit(request, response, retryAfterSeconds)` writes the 429 body. */
  function middleware(onLimit) {
    return (request, response, next) => {
      const verdict = check(clientKey(request.ip));
      if (verdict.allowed) return next();
      response.set('Retry-After', String(verdict.retryAfterSeconds));
      onLimit(request, response, verdict.retryAfterSeconds);
    };
  }
  return { check, middleware, size: () => hits.size };
}

/**
 * CONTACT_RATE_LIMIT_PER_MINUTE (default 60, the PRD figure). An open contact page polls every 3 s,
 * about 20 requests a minute, so several devices behind one venue Wi-Fi address share one allowance:
 * raise it for a demo, never to "unlimited". Invalid values stop the server from starting.
 */
export function rateLimitFromEnv(env = process.env) {
  const raw = env.CONTACT_RATE_LIMIT_PER_MINUTE;
  if (raw === undefined || raw.trim() === '') return {};
  const limit = Number(raw);
  if (!/^\d+$/.test(raw.trim()) || limit < 1 || limit > 10_000)
    throw new Error('CONTACT_RATE_LIMIT_PER_MINUTE must be a whole number from 1 to 10000');
  return { limit };
}
