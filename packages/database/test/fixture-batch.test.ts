import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { listWorkspaces } from '../src/workspaces.ts';
import { getForm } from '../src/forms.ts';
import { listResponses, getResponse } from '../src/responses.ts';
import { seedResponses } from './fixtures/forms.ts';

it('seeds realistic restricted-role fixtures without committing or interpreting fixture text as SQL', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = Error('Rollback batched fixtures');
  const name = "QA O'Brien — <script> '; select 1; --";
  let actor = '';
  try {
    await expect(
      db.transaction(async (tx) => {
        const fixture = await seedResponses(tx, name);
        actor = fixture.actor;
        expect(await listWorkspaces(tx, actor)).toMatchObject([
          { id: fixture.workspaceId, name, role: 'owner' },
        ]);
        expect(
          await getForm(tx, actor, fixture.workspaceId, fixture.formId),
        ).toMatchObject({
          revision: 2,
          definition: { title: 'Changed draft title' },
        });
        expect(
          (
            await listResponses(tx, actor, fixture.workspaceId, fixture.formId)
          ).responses.map((response) => response.id),
        ).toEqual(fixture.ids);
        const response = await getResponse(
          tx,
          actor,
          fixture.workspaceId,
          fixture.formId,
          fixture.ids[0],
        );
        expect(response.definition.title).toBe(fixture.definition.title);
        expect(response.answers[fixture.budgetId]).toEqual({
          state: 'value',
          value: 0,
        });
        await expect(
          listResponses(
            tx,
            crypto.randomUUID(),
            fixture.workspaceId,
            fixture.formId,
          ),
        ).rejects.toThrow('WORKSPACE_NOT_FOUND');
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(
      (
        await db.execute(
          sql`select count(*)::int as remaining from public."user" where id=${actor}`,
        )
      ).rows,
    ).toEqual([{ remaining: 0 }]);
  } finally {
    await close();
  }
}, 30000);
