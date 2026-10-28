import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema.ts';

// Neon requires a fresh Pool per Worker request; always close it in finally.
export function openDatabase(connectionString: string) {
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
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
  });
  return { db: drizzle({ client: pool, schema }), close: () => pool.end() };
}
export type Database = ReturnType<typeof openDatabase>['db'];

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
