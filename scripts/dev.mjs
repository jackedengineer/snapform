import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

// Wrangler recreates the API isolate on edits, releasing the Node HTTP listener.
// Vite keeps the frontend's fast refresh and discovers the API service binding.
const apiPort = Number(process.env.SNAPFORM_API_PORT || 8787);
if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535)
  throw Error('A valid local API port is required.');
const commands = [
  [
    '--filter',
    '@snapform/api',
    'exec',
    'wrangler',
    'dev',
    '--config',
    'wrangler.jsonc',
    '--config',
    '../jobs/wrangler.jsonc',
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    String(apiPort),
    '--inspector-port',
    '0',
    '--log-level',
    'warn',
  ],
  ['--filter', '@snapform/web', 'dev'],
];
// Vite and Wrangler otherwise use different registry defaults. Scope discovery
// to this checkout so unrelated local projects cannot provide the API binding.
const environment = {
  ...process.env,
  CLOUDFLARE_DEV_REGISTRY_PATH: resolve('.wrangler/dev-registry'),
};
const children = commands.map((args) =>
  spawn('pnpm', args, {
    env: environment,
    stdio: 'inherit',
    detached: true,
  }),
);
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.exitCode === null && child.pid)
      process.kill(-child.pid, 'SIGTERM');
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
