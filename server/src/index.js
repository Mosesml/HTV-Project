import { createApp } from './app.js';
import { SessionStore } from './sessions.js';
import { EscalationEngine } from './escalations.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535');
}
const sessions = new SessionStore();
const engine = new EscalationEngine({ sessions, deliver: event => console.log(JSON.stringify({ type: 'simulated-notification', ...event })) });
const server = createApp({ sessions, engine }).listen(port, '0.0.0.0', () => {
  console.log(`RaveGuard simulation server (no SMS) listening on port ${port}`);
});
engine.start();
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    engine.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
