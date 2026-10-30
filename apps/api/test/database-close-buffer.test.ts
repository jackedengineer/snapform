import { afterEach, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '@snapform/database';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function transport() {
  const pair = new WebSocketPair(),
    server = pair[1];
  server.binaryType = 'arraybuffer';
  server.accept();
  let terminated = false;
  let lateWrites = 0;
  const nativeSend = pair[0].send.bind(pair[0]);
  vi.spyOn(pair[0], 'send').mockImplementation((data) => {
    if (pair[0].readyState !== 1) {
      lateWrites++;
      return;
    }
    nativeSend(data);
  });
  server.addEventListener('message', (event) => {
    const bytes = new Uint8Array(event.data as ArrayBuffer);
    if (bytes[0] === 0) {
      // A minimal synthetic PostgreSQL authentication/ReadyForQuery exchange.
      server.send(
        new Uint8Array([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73]),
      );
    } else if (bytes[0] === 88) {
      terminated = true;
      server.close();
    }
  });
  server.addEventListener('close', () => server.close());
  class UpgradeSocket {
    constructor() {
      throw Error('Use the synthetic fetch-upgrade transport');
    }
  }
  vi.stubGlobal('WebSocket', UpgradeSocket);
  vi.stubGlobal('__unstable_WebSocket', UpgradeSocket);
  const fetcher = vi.fn(
    async () => new Response(null, { status: 101, webSocket: pair[0] }),
  );
  vi.stubGlobal('fetch', fetcher);
  return {
    server,
    fetcher,
    terminated: () => terminated,
    lateWrites: () => lateWrites,
  };
}
const url =
  'postgresql://snapform_runtime:synthetic-not-a-real-key@qa.neon.tech/snapform?sslmode=require';
it('flushes PostgreSQL termination before closing the Worker WebSocket without a later write', async () => {
  const fixture = transport();
  let connection: Awaited<ReturnType<typeof openDatabase>> | undefined;
  try {
    connection = await openDatabase(url);
    await connection.close();
    connection = undefined;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fixture.fetcher).toHaveBeenCalledOnce();
    expect(fixture.terminated()).toBe(true);
    expect(fixture.lateWrites()).toBe(0);
  } finally {
    await connection?.close();
    fixture.server.close();
  }
});
it('rejects a query when its peer closes in the same turn without a later buffered write', async () => {
  const fixture = transport();
  const connection = await openDatabase(url);
  try {
    const query = connection.db.execute(sql`select 1`).then((value) => value);
    fixture.server.close();
    await expect(query).rejects.toThrow();
    await connection.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fixture.fetcher).toHaveBeenCalledOnce();
    expect(fixture.lateWrites()).toBe(0);
  } finally {
    fixture.server.close();
  }
});
