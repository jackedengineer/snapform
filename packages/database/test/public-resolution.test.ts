import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm, saveDraft } from '../src/forms.ts';
import { publishForm, unpublishForm } from '../src/publication.ts';
import { formVersion } from '../src/publication-schema.ts';
import { resolvePublicForm } from '../src/public-form.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
it('resolves only live pinned definitions without granting anonymous table access', async () => {
  if (!process.env.DATABASE_URL)
    throw new Error('Runtime database configuration is required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = new Error('Rollback public-resolution fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const actor = crypto.randomUUID(),
          formId = crypto.randomUUID();
        const definition = formFixture().definition;
        await tx.insert(user).values({
          id: actor,
          name: 'Public lookup QA',
          email: `${actor}@example.invalid`,
          emailVerified: true,
        });
        const workspace = await createWorkspace(tx, actor, {
          id: crypto.randomUUID(),
          name: 'Public lookup QA',
          segment: 'agency',
        });
        await createForm(tx, actor, workspace.id, { id: formId, definition });
        const published = await publishForm(tx, actor, workspace.id, formId, {
          versionId: crypto.randomUUID(),
          expectedRevision: 1,
        });
        if (!published.publication) throw new Error('Expected publication');
        const publicId = published.publication.publicId;
        await saveDraft(tx, actor, workspace.id, formId, {
          operationId: crypto.randomUUID(),
          expectedRevision: 1,
          definition: { ...definition, title: 'Private draft edits' },
        });
        await tx.execute(
          sql`select set_config('snapform.user_id','',true),set_config('snapform.workspace_id','',true),set_config('snapform.role','',true)`,
        );
        expect(await tx.select().from(formVersion)).toHaveLength(0);
        const visible = await resolvePublicForm(tx, publicId);
        expect(visible).toEqual({
          publicId,
          versionId: published.versionId,
          definition,
          businessName: 'Public lookup QA',
        });
        expect(Object.keys(visible!)).toEqual([
          'publicId',
          'versionId',
          'definition',
          'businessName',
        ]);
        // The query deployed before migration 0044 still reads named columns.
        const deployed = await tx.execute(
          sql`select public_id, version_id, definition from public.resolve_published_form(${publicId}::uuid)`,
        );
        expect(deployed.rows).toEqual([
          {
            public_id: publicId,
            version_id: published.versionId,
            definition,
          },
        ]);
        expect(await resolvePublicForm(tx, crypto.randomUUID())).toBeNull();
        await expect(
          resolvePublicForm(tx, "';select * from public.user"),
        ).rejects.toThrow();
        expect(await tx.select().from(formVersion)).toHaveLength(0);
        await unpublishForm(tx, actor, workspace.id, formId, {
          expectedVersionId: published.versionId,
        });
        await tx.execute(
          sql`select set_config('snapform.user_id','',true),set_config('snapform.workspace_id','',true),set_config('snapform.role','',true)`,
        );
        expect(await resolvePublicForm(tx, publicId)).toBeNull();
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}, 30000);
it('keeps the public lookup runtime-only after adding the business name', async () => {
  if (!process.env.DATABASE_URL)
    throw new Error('Runtime database configuration is required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  try {
    expect(
      (
        await db.execute(sql`select
          has_function_privilege(current_user,'public.resolve_published_form(uuid)','EXECUTE') as app,
          has_function_privilege('snapform_jobs','public.resolve_published_form(uuid)','EXECUTE') as jobs,
          exists(select 1 from aclexplode(p.proacl) a where a.grantee = 0) as anyone,
          p.prosecdef as definer,p.provolatile as volatility,p.proconfig as config,
          pg_get_function_result(p.oid) as result
          from pg_proc p where p.oid='public.resolve_published_form(uuid)'::regprocedure`)
      ).rows,
    ).toEqual([
      {
        app: true,
        jobs: false,
        anyone: false,
        definer: true,
        volatility: 's',
        config: ['search_path=pg_catalog'],
        result:
          'TABLE(public_id uuid, version_id uuid, definition jsonb, business_name text)',
      },
    ]);
  } finally {
    await close();
  }
});
