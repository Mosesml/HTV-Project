// Start an isolated HTTP server, run the actual curl handoff script, then close it.
// This performs no SMS or external network requests.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';

const server = createApp().listen(0, '127.0.0.1');
await once(server, 'listening');
let child;
try {
  child = spawn('bash', [fileURLToPath(new URL('./smoke-sessions.sh', import.meta.url)),
    `http://127.0.0.1:${server.address().port}`], { stdio: 'inherit', timeout: 60_000 });
  const [code] = await once(child, 'exit');
  process.exitCode = code === 0 ? 0 : 1;
} finally {
  child?.kill();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
