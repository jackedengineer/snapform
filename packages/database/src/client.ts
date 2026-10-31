import { Client } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema.ts';

// One Client per Worker request; end() waits for the actual disconnect.
export async function openDatabase(connectionString: string) {
  let valid = false;
  try {
    const url = new URL(connectionString);
    valid =
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.hostname.endsWith('.neon.tech') &&
      Boolean(url.username && url.password) &&
      url.pathname === '/snapform' &&
      url.searchParams.get('sslmode') === 'require';
  } catch {
    /* Invalid configuration is reported without reflecting a secret URL. */
  }
  if (!valid) throw new Error('A valid secure Neon connection is required.');
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
  });
  // Readiness must confirm server authentication, not optimistic pipelining.
  client.neonConfig.pipelineConnect = false;
  // A deferred flush can run after peer close in both Node and Workers,
  // escaping the query promise. Send through the driver's immediate path.
  client.neonConfig.coalesceWrites = false;
  client.on('error', () => {
    console.error(JSON.stringify({ event: 'database_connection_failed' }));
  });
  let socketClosed = false;
  const disconnected = new Promise<void>((resolve) => {
    client.neonConfig.once('close', () => {
      socketClosed = true;
      resolve();
    });
  });
  let closing: Promise<void> | undefined;
  async function close() {
    // After a peer close, end() can write again and await an already-fired event.
    if (socketClosed) return;
    closing ??= Promise.race([client.end(), disconnected]);
    await closing;
  }
  try {
    await client.connect();
  } catch {
    await close().catch(() => {
      console.error(JSON.stringify({ event: 'database_disconnect_failed' }));
    });
    throw new Error('Database connection is unavailable.');
  }
  return { db: drizzle({ client, schema }), close };
}
export type Database = Awaited<ReturnType<typeof openDatabase>>['db'];

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
