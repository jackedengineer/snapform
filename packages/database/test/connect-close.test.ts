import { afterEach, expect, it } from 'vitest';
import { neonConfig } from '@neondatabase/serverless';
import { openDatabase } from '../src/client.ts';
const previous = neonConfig.webSocketConstructor;
afterEach(() => {
  neonConfig.webSocketConstructor = previous;
});
it('flushes normal Node termination before closing and never writes into a closed socket', async () => {
  let lateWrites = 0,
    terminated = false;
  class ReadySocket extends EventTarget {
    readyState = 0;
    binaryType = 'arraybuffer';
    constructor() {
      super();
      queueMicrotask(() => {
        this.readyState = 1;
        this.dispatchEvent(new Event('open'));
      });
    }
    send(bytes: Uint8Array) {
      if (this.readyState !== 1) {
        lateWrites++;
        return;
      }
      if (bytes[0] === 0)
        queueMicrotask(() =>
          this.dispatchEvent(
            new MessageEvent('message', {
              data: new Uint8Array([
                82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73,
              ]).buffer,
            }),
          ),
        );
      else if (bytes[0] === 88) {
        terminated = true;
        this.close();
      }
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      queueMicrotask(() => this.dispatchEvent(new Event('close')));
    }
  }
  neonConfig.webSocketConstructor = ReadySocket;
  const connection = await openDatabase(
    'postgresql://snapform_runtime:synthetic-not-a-key@qa.neon.tech/snapform?sslmode=require',
  );
  await Promise.all([connection.close(), connection.close()]);
  await connection.close();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(terminated).toBe(true);
  expect(lateWrites).toBe(0);
}, 1000);
it('rejects promptly when the real driver observes a peer close before authentication', async () => {
  let lateWrites = 0;
  class ClosingSocket extends EventTarget {
    readyState = 0;
    binaryType = 'arraybuffer';
    constructor() {
      super();
      queueMicrotask(() => {
        this.readyState = 3;
        this.dispatchEvent(new Event('close'));
      });
    }
    send() {
      lateWrites++;
    }
    close() {
      /* A closed WebSocket does not emit another close event. */
    }
  }
  neonConfig.webSocketConstructor = ClosingSocket;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      openDatabase(
        'postgresql://snapform_runtime:synthetic-not-a-key@qa.neon.tech/snapform?sslmode=require',
      ).then(
        () => 'unexpected connection',
        (error) => String(error.message),
      ),
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve('unsettled cleanup'), 200);
      }),
    ]);
    expect(result).toBe('Database connection is unavailable.');
    expect(lateWrites).toBe(0);
  } finally {
    clearTimeout(timeout);
  }
});
