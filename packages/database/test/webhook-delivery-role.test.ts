import { expect, it } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { user } from '../src/schema.ts';
import { createWorkspace, inWorkspace } from '../src/workspaces.ts';
import { createForm } from '../src/forms.ts';
import { publishForm } from '../src/publication.ts';
import { saveWebhookConfiguration } from '../src/webhook-settings.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
import { createWebhookPayload } from '../../contracts/src/webhook-payload.ts';
import { openDatabase } from '../src/client.ts';
it('keeps delivery outcomes outside application authority and hides unscoped rows', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  try {
    expect(
      (
        await db.execute(
          sql`select has_table_privilege(current_user,'public.webhook_delivery','SELECT') as read,has_table_privilege(current_user,'public.webhook_delivery','INSERT') as preview,has_table_privilege(current_user,'public.webhook_delivery','UPDATE') as update,has_table_privilege(current_user,'public.webhook_delivery','DELETE') as remove,has_table_privilege('snapform_jobs','public.webhook_delivery','SELECT') as jobs_read`,
        )
      ).rows,
    ).toEqual([
      {
        read: true,
        preview: true,
        update: false,
        remove: false,
        jobs_read: false,
      },
    ]);
    expect(
      (
        await db.execute(
          sql`select has_function_privilege(current_user,'public.seed_response_webhook()','EXECUTE') as seed,has_function_privilege(current_user,'public.cancel_form_webhooks()','EXECUTE') as cancel,has_function_privilege('snapform_jobs','public.seed_response_webhook()','EXECUTE') as job_seed`,
        )
      ).rows,
    ).toEqual([{ seed: false, cancel: false, job_seed: false }]);
    expect(
      (await db.execute(sql`select id from public.webhook_delivery`)).rows,
    ).toEqual([]);
    await expect(
      db.execute(
        sql`insert into public.webhook_delivery(id,workspace_id,form_id,configuration_id,version_id,kind,status,payload,created_by) values(${crypto.randomUUID()}::uuid,${crypto.randomUUID()}::uuid,${crypto.randomUUID()}::uuid,${crypto.randomUUID()}::uuid,${crypto.randomUUID()}::uuid,'test','preview','{}',${crypto.randomUUID()})`,
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  } finally {
    await close();
  }
}, 20000);
it('allows a real application owner to prepare a test but never forge response jobs or outcomes', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL),
    rollback = Error('Rollback scoped webhook authorization fixture');
  const actor = crypto.randomUUID();
  try {
    expect((await db.execute(sql`select current_user as actor`)).rows).toEqual([
      { actor: 'snapform_runtime' },
    ]);
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(user).values({
          id: actor,
          name: 'Webhook role QA',
          email: `${actor}@example.invalid`,
          emailVerified: true,
        });
        const workspace = await createWorkspace(tx, actor, {
          id: crypto.randomUUID(),
          name: 'Webhook role QA',
          segment: 'agency',
        });
        const formId = crypto.randomUUID(),
          configurationId = crypto.randomUUID(),
          { definition, ids } = formFixture();
        await createForm(tx, actor, workspace.id, { id: formId, definition });
        const published = (
          await publishForm(tx, actor, workspace.id, formId, {
            versionId: crypto.randomUUID(),
            expectedRevision: 1,
          })
        ).publication;
        expect(Boolean(published)).toBe(true);
        if (!published) throw Error('Published fixture required');
        await saveWebhookConfiguration(
          tx,
          actor,
          workspace.id,
          formId,
          {
            configurationId,
            expectedRevision: 0,
            url: 'https://hooks.example.com/rollback-only',
          },
          Buffer.alloc(32, 7).toString('base64'),
        );
        const id = crypto.randomUUID(),
          at = new Date().toISOString();
        const body = createWebhookPayload(
          { id, formId, createdAt: at },
          {
            id: crypto.randomUUID(),
            versionId: published.versionId,
            version: 1,
            submittedAt: at,
            definition,
            answers: {
              [ids.budget]: { state: 'value', value: 0 },
              [ids.contact]: { state: 'value', value: 'qa@example.invalid' },
            },
          },
          true,
        );
        await inWorkspace(
          tx,
          actor,
          workspace.id,
          'integrations.manage',
          async (scoped) => {
            await scoped.execute(
              sql`insert into public.webhook_delivery(id,workspace_id,form_id,configuration_id,version_id,kind,status,payload,created_by,created_at) values(${id}::uuid,${workspace.id}::uuid,${formId}::uuid,${configurationId}::uuid,${published.versionId}::uuid,'test','preview',${body},${actor},${at}::timestamptz)`,
            );
            expect(
              (
                await scoped.execute(
                  sql`select id,kind,status from public.webhook_delivery where id=${id}::uuid`,
                )
              ).rows,
            ).toEqual([{ id, kind: 'test', status: 'preview' }]);
            expect(
              (
                await scoped.execute(
                  sql`select count(*)::integer as count from public.response_session where form_id=${formId}::uuid`,
                )
              ).rows,
            ).toEqual([{ count: 0 }]);
            await expect(
              scoped.transaction(async (guard) => {
                await guard.execute(
                  sql`insert into public.webhook_delivery(workspace_id,form_id,configuration_id,version_id,event_id,session_id,kind,status) values(${workspace.id}::uuid,${formId}::uuid,${configurationId}::uuid,${published.versionId}::uuid,${crypto.randomUUID()}::uuid,${crypto.randomUUID()}::uuid,'response.submitted','pending')`,
                );
              }),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
            await expect(
              scoped.transaction(async (guard) => {
                await guard.execute(
                  sql`update public.webhook_delivery set status='acknowledged' where id=${id}::uuid`,
                );
              }),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
          },
        );
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(
      await db.select({ id: user.id }).from(user).where(eq(user.id, actor)),
    ).toHaveLength(0);
  } finally {
    await close();
  }
}, 30000);
it('denies claim, prepare and outcome authority to the actual application login', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  try {
    expect(
      (
        await db.execute(
          sql`select has_function_privilege(current_user,'public.claim_webhooks(integer,uuid)','EXECUTE') as claim,has_function_privilege(current_user,'public.prepare_webhook_payload(uuid,uuid,text)','EXECUTE') as prepare,has_function_privilege(current_user,'public.record_webhook_attempt(uuid,uuid,text,integer,text,integer)','EXECUTE') as record`,
        )
      ).rows,
    ).toEqual([{ claim: false, prepare: false, record: false }]);
    const id = crypto.randomUUID(),
      token = crypto.randomUUID();
    for (const statement of [
      sql`select * from public.claim_webhooks(1,${id}::uuid)`,
      sql`select public.prepare_webhook_payload(${id}::uuid,${token}::uuid,null)`,
      sql`select public.record_webhook_attempt(${id}::uuid,${token}::uuid,'acknowledged',204,null,0)`,
    ])
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(statement);
          throw Error('Unexpected application delivery authority');
        }),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
  } finally {
    await close();
  }
}, 20000);
