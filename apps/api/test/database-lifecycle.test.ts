import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { EventEmitter } from 'node:events';
import { openDatabase } from '@snapform/database';
import type { AuthEnvironment } from '../src/environment.ts';
it('finishes the actual database disconnect before close resolves', async () => {
  const { db, close } = await openDatabase(
    (env as AuthEnvironment).DATABASE_URL,
  );
  let disconnected = false;
  // Both documented driver lifecycles: Client end, or Pool client removal.
  const events = db.$client as EventEmitter;
  events.on('end', () => {
    disconnected = true;
  });
  events.on('remove', () => {
    disconnected = true;
  });
  try {
    await db.execute(sql`select 1`);
  } finally {
    await close();
  }
  expect(disconnected).toBe(true);
}, 20000);
it('sanitizes an actual rejected database login and closes its connection', async () => {
  const url = new URL((env as AuthEnvironment).DATABASE_URL);
  url.password = 'Synthetic-invalid-QA-password';
  let rejected = false;
  let opened: Awaited<ReturnType<typeof openDatabase>> | undefined;
  try {
    opened = await openDatabase(url.toString());
  } catch (error) {
    rejected = true;
    expect(error instanceof Error ? error.message : '').toBe(
      'Database connection is unavailable.',
    );
  } finally {
    await opened?.close();
  }
  // A failed assertion must never serialize a credential-bearing client object.
  expect(rejected).toBe(true);
}, 20000);
