import { expect, it, vi } from 'vitest';
import type { Database, Transaction } from '../src/client.ts';
import { startIntake, getIntake } from '../src/intake.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';

it.each([
  ['admission', startIntake],
  ['recovery', getIntake],
] as const)(
  'keeps %s to one authorized database statement',
  async (_name, run) => {
    const snapshot = {
      id: crypto.randomUUID(),
      publicId: crypto.randomUUID(),
      versionId: crypto.randomUUID(),
      definition: formFixture().definition,
      revision: 1,
      answers: {},
      expiresAt: '2030-01-01T00:00:00.000Z',
      status: 'collecting',
    };
    const execute = vi.fn(async () => ({ rows: [snapshot] }));
    const boundary = {
      execute,
      async transaction(
        callback: (tx: Transaction) => Promise<unknown>,
      ): Promise<unknown> {
        return callback(boundary as unknown as Transaction);
      },
    };
    expect(
      await run(
        boundary as unknown as Database,
        snapshot.publicId,
        snapshot.id,
        'a'.repeat(64),
      ),
    ).toEqual(snapshot);
    // A transport budget, not a query-string assertion. Real SQL authorization,
    // rollback, mutation atomicity and concurrency are checked separately.
    expect(execute).toHaveBeenCalledTimes(1);
  },
);
