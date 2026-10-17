// Starts the real server with two synthetic alerts already fired, so the contact page can be
// opened in a browser: `npm run demo:contact`. Synthetic names and numbers only; nothing is sent.
import { createApp } from '../src/app.js';
import { SessionStore } from '../src/sessions.js';
import { EscalationEngine } from '../src/escalations.js';

const port = Number(process.env.PORT ?? 3100);
const sessions = new SessionStore();
const engine = new EscalationEngine({ sessions });
engine.start();
const recipient = (n, name, permissions) => ({ id: `${n}`.repeat(8) + `-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-` + `${n}`.repeat(12),
  name, phoneE164: `+1555555010${n}`, kind: 'contact', order: Number(n), permissions });
const { sessionId } = sessions.create({ wearerName: 'Alex', selfDescription: 'black hoodie, white cap', demo: true,
  utcOffsetMinutes: -new Date().getTimezoneOffset(), recipients: [
    recipient(1, 'Contact 1 (full brief, location, can resolve)', { receiveAlerts: true, seeLocation: true, seeFullBrief: true, canResolve: true }),
    recipient(2, 'Contact 2 (reduced, no location, cannot resolve)', { receiveAlerts: true, seeLocation: false, seeFullBrief: false, canResolve: false })] });
const facts = () => ({ wearerName: 'Alex', selfDescription: 'black hoodie, white cap', lastActiveState: 'dancing',
  lastActiveUntil: new Date(Date.now() - 45_000).toISOString(),
  trigger: { kind: 'fall', at: new Date(Date.now() - 90_000).toISOString(), reason: 'spike 3.1 g, head 70° sideways, still 12 s' },
  promptsUnanswered: 2, location: { lat: 43.4723, lon: -80.5449, accuracyM: 20, at: new Date(Date.now() - 100_000).toISOString() } });
const normal = engine.register(sessionId, new Date().toISOString(), facts());
const duress = engine.register(sessionId, new Date().toISOString(), facts());
engine.cancel(duress, 'duress');
createApp({ sessions, engine }).listen(port, '127.0.0.1', () => {
  console.log(`Demo server on http://127.0.0.1:${port} (Contact 2 is notified after 20 s)`);
  const shown = new Set();
  const timer = setInterval(() => {
    for (const [label, id] of [['normal', normal], ['duress', duress]])
      for (const n of [1, 2]) {
        const key = `${label}${n}`; const token = engine.contactToken(id, recipient(n, '', {}).id);
        if (!shown.has(key) && engine.resolveToken(token)) { shown.add(key); console.log(`${label} contact ${n}: http://127.0.0.1:${port}/a/${token}`); }
      }
    if (shown.size === 4) clearInterval(timer);
  }, 500);
});
