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
  // In Workers, deferred writes can escape the request after a peer close.
  // Node tooling keeps its driver's validated batching behavior.
  if ('WebSocketPair' in globalThis) client.neonConfig.coalesceWrites = false;
  client.on('error', () => {
    console.error(JSON.stringify({ event: 'database_connection_failed' }));
  });
  try {
    await client.connect();
  } catch {
    await client.end().catch(() => {
      console.error(JSON.stringify({ event: 'database_disconnect_failed' }));
    });
    throw new Error('Database connection is unavailable.');
  }
  return { db: drizzle({ client, schema }), close: () => client.end() };
}
export type Database = Awaited<ReturnType<typeof openDatabase>>['db'];

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
