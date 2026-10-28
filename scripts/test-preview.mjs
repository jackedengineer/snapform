import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const base = 'http://127.0.0.1:5173';
try {
  await fetch(base, { signal: AbortSignal.timeout(500) });
  throw new Error(
    'Port 5173 is already in use. Stop the local preview before running this isolated check.',
  );
} catch (error) {
  if (error instanceof Error && error.message.startsWith('Port')) throw error;
}
const child = spawn('pnpm', ['--filter', '@snapform/web', 'preview'], {
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-6000);
  });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`Preview exited before startup.\n${output}`);
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(500) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Readiness is retried within the bounded startup window. */
    }
    await setTimeout(250);
  }
  if (!ready) throw new Error(`Preview did not become ready.\n${output}`);
  await import('./check-preview.mjs');
} finally {
  if (child.exitCode === null) process.kill(-child.pid, 'SIGTERM');
}
