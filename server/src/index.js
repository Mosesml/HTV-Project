import { createApp } from './app.js';
import { SessionStore } from './sessions.js';
import { EscalationEngine } from './escalations.js';
import { loadSmsConfig, liveDelivery } from './notifier.js';

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
const server = createApp({ sessions, engine, notificationsEnabled: !!live }).listen(port, '0.0.0.0', () => {
  console.log(live ? `RaveGuard server with LIVE SMS listening on port ${port}`
    : `RaveGuard simulation server (no SMS) listening on port ${port}`);
});
engine.start();
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    engine.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
