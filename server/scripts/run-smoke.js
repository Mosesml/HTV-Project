// Start an isolated HTTP server, run the actual curl handoff script, then close it.
// This performs no SMS or external network requests.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { SessionStore } from '../src/sessions.js';
import { EscalationEngine } from '../src/escalations.js';

const sessions = new SessionStore();
const engine = new EscalationEngine({ sessions });
engine.start();
const server = createApp({ sessions, engine }).listen(0, '127.0.0.1');
await once(server, 'listening');
let child;
try {
  for (const script of ['./smoke-sessions.sh', './smoke-escalations.sh']) {
    child = spawn('bash', [fileURLToPath(new URL(script, import.meta.url)),
      `http://127.0.0.1:${server.address().port}`], { stdio: 'inherit', timeout: 60_000 });
    const [code] = await once(child, 'exit');
    if (code !== 0) { process.exitCode = 1; break; }
  }
} finally {
  child?.kill();
  engine.stop();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
