import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { parseEnv } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

for (const port of [5173, 8787]) {
  let occupied = false;
  try {
    await fetch(`http://127.0.0.1:${port}`, {
      signal: AbortSignal.timeout(500),
    });
    occupied = true;
  } catch {
    /* A connection failure means there is no responsive HTTP server. */
  }
  assert.equal(
    occupied,
    false,
    `Stop the server on port ${port} before this isolated development check.`,
  );
}
const path = 'apps/api/src/worker.ts';
const original = await readFile(path, 'utf8');
const probe = original.replace(
  "'Cache-Control': 'no-store',",
  "'Cache-Control': 'no-store',\n    'X-Local-Reload-Probe': 'active',",
);
assert.notEqual(
  probe,
  original,
  'The reload probe must modify the middleware.',
);
const child = spawn(process.execPath, ['scripts/dev.mjs'], {
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-6000);
  });
async function waitForHeader(expected) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`Development server exited.\n${output}`);
    try {
      const response = await fetch(
        'http://127.0.0.1:5173/api/v1/brief/review',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            goal: 'A synthetic development brief.',
            budget: 0,
            currency: 'USD',
            targetDate: '2027-01-15',
          }),
          signal: AbortSignal.timeout(500),
        },
      );
      if (
        response.status === 200 &&
        response.headers.get('X-Local-Reload-Probe') === expected
      )
        return;
    } catch {
      /* A Worker may be unavailable briefly while its isolate restarts. */
    }
    await setTimeout(250);
  }
  throw new Error(`API reload did not reach the expected handler.\n${output}`);
}
let modified = false;
try {
  await waitForHeader(null);
  await writeFile(path, probe);
  modified = true;
  await waitForHeader('active');
  assert.equal(
    await readFile(path, 'utf8'),
    probe,
    'Refuse to overwrite another edit.',
  );
  await writeFile(path, original);
  modified = false;
  await waitForHeader(null);
  output = ''; // Only failures after the completed reload belong to this lifecycle check.
  const local = parseEnv(await readFile('apps/api/.dev.vars', 'utf8'));
  const recipient =
    local.AUTH_ALLOWED_RECIPIENT || 'runtime-check@example.invalid';
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(
      'http://127.0.0.1:5173/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://127.0.0.1:5173',
        },
        body: JSON.stringify({
          email: recipient,
          password: 'Synthetic-runtime-check-wrong-password',
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    assert.equal(
      response.status,
      401,
      'The live auth bridge must reject synthetic invalid credentials.',
    );
    await response.arrayBuffer();
    await setTimeout(500);
  }
  assert.doesNotMatch(
    output,
    /Unhandled error|Network connection lost|auth_request_failed/,
  );
  console.log(
    'Two API reloads and three real auth request/cleanup cycles passed.',
  );
} finally {
  try {
    if (modified) {
      assert.equal(
        await readFile(path, 'utf8'),
        probe,
        'Refuse to overwrite another edit.',
      );
      await writeFile(path, original);
    }
  } finally {
    if (child.exitCode === null) process.kill(-child.pid, 'SIGTERM');
  }
}
