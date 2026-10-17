// Run by persistence-crash.test.js as a real child process: fire Contact 1 and be SIGKILLed by the
// operating system inside the SMS transport, i.e. after the send started and before it finished.
import { appendFileSync } from 'node:fs';
import { makeStack, startEscalation } from '../support/stack.js';

const [dir, sentFile] = process.argv.slice(2);
const stack = await makeStack({ dir, transport: async message => {
  appendFileSync(sentFile, `${message.to}\n`);   // the "send" has begun
  process.kill(process.pid, 'SIGKILL');          // no cleanup, no flush, no exit handlers
  await new Promise(() => {});
} });
startEscalation(stack);
stack.clock.t += 35_000;
stack.engine.sweep();
await new Promise(resolve => setTimeout(resolve, 5000));   // never reached
console.error('child survived');
process.exit(3);
