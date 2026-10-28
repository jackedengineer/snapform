import { spawn } from 'node:child_process';

// Wrangler recreates the API isolate on edits, releasing the Node HTTP listener.
// Vite keeps the frontend's fast refresh and discovers the API service binding.
const children = ['@snapform/api', '@snapform/web'].map((name) =>
  spawn('pnpm', ['--filter', name, 'dev'], {
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
