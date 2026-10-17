import { createApp } from './app.js';
import { SessionStore } from './sessions.js';
import { EscalationEngine } from './escalations.js';
import { loadSmsConfig, liveDelivery } from './notifier.js';
import { rateLimitFromEnv } from './rate-limit.js';
import { openPersistence } from './persistence.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535');
}
// SMS_MODE=live that is not completely and safely configured must not boot at all.
let sms;
try { sms = loadSmsConfig(); } catch (error) {
  console.error(`Refusing to start: ${error.message}`);
  process.exit(1);
}
const live = liveDelivery(sms, event => console.log(JSON.stringify(event)));
const sessions = new SessionStore();
const engine = new EscalationEngine({ sessions, simulated: !live,
  deliver: live ? event => notify(event)
    : event => console.log(JSON.stringify({ type: 'simulated-notification', ...event })) });
const notify = live ? live(engine) : null;
// AN13: DATA_DIR turns on the snapshot (on Railway: a mounted volume, e.g. /data). Unset = in-memory as before.
// Restore happens before the server listens and before the first sweep, so overdue deadlines fire once.
const dataDir = process.env.DATA_DIR?.trim();
const persistence = dataDir
  ? openPersistence({ dir: dataDir, sessions, engine, log: event => console.log(JSON.stringify(event)) }) : null;
// Behind Railway this must be 2, measured in production: its edge sends `X-Forwarded-For: <client>, <edge node>`
// and the edge node rotates, so 1 hop keys the rate limiter on the edge and nobody is ever limited.
// The default of 1 is only right behind a single plain proxy. TRUST_PROXY_HOPS overrides (0 = none).
const trustProxy = Number(process.env.TRUST_PROXY_HOPS ?? 1);
if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 5) {
  throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 5');
}
let rateLimit;
try { rateLimit = rateLimitFromEnv(); } catch (error) { console.error(`Refusing to start: ${error.message}`); process.exit(1); }
const server = createApp({ sessions, engine, notificationsEnabled: !!live, trustProxy, persistence, rateLimit }).listen(port, '0.0.0.0', () => {
  console.log(live ? `Guardian server with LIVE SMS listening on port ${port}`
    : `Guardian simulation server (no SMS) listening on port ${port}`);
});
engine.start();
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    engine.stop();
    persistence?.save();   // final snapshot, including any coalesced heartbeats
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
