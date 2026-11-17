import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm } from '../src/forms.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
import { createWebhookSecret } from '@snapform/contracts/webhook-crypto';
import {
  configureWebhookDelivery,
  getWebhookSettings,
  saveWebhookConfiguration,
} from '../src/webhook-settings.ts';

it('starts webhook configurations disabled and prevents unverified enablement', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = Error('Rollback webhook settings fixture');
  try {
    await expect(
      db.transaction(async (tx) => {
        const actor = crypto.randomUUID(),
          formId = crypto.randomUUID(),
          configurationId = crypto.randomUUID();
        await tx.insert(user).values({
          id: actor,
          name: 'Webhook QA',
          email: `${actor}@example.invalid`,
          emailVerified: true,
        });
        const workspace = await createWorkspace(tx, actor, {
          id: crypto.randomUUID(),
          name: 'Webhook QA',
          segment: 'agency',
        });
        await createForm(tx, actor, workspace.id, {
          id: formId,
          definition: formFixture().definition,
        });
        await tx.execute(
          sql`insert into public.webhook_configuration(id,workspace_id,form_id,sealed_destination,created_by) values(${configurationId}::uuid,${workspace.id}::uuid,${formId}::uuid,${'v1.' + 'A'.repeat(80)},${actor})`,
        );
        await tx.execute(
          sql`insert into public.form_webhook_settings(workspace_id,form_id,configuration_id,updated_by) values(${workspace.id}::uuid,${formId}::uuid,${configurationId}::uuid,${actor})`,
        );
        expect(
          (
            await tx.execute(
              sql`select enabled,revision from public.form_webhook_settings where form_id=${formId}::uuid`,
            )
          ).rows,
        ).toEqual([{ enabled: false, revision: 1 }]);
        await expect(
          tx.transaction(async (guard) => {
            await guard.execute(
              sql`update public.form_webhook_settings set enabled=true where form_id=${formId}::uuid`,
            );
          }),
        ).rejects.toMatchObject({ cause: { code: '23514' } });
        await expect(
          tx.transaction(async (guard) => {
            await guard.execute(
              sql`update public.webhook_configuration set sealed_destination=${'v1.' + 'B'.repeat(80)} where id=${configurationId}::uuid`,
            );
          }),
        ).rejects.toMatchObject({ cause: { code: '42501' } });
        await expect(
          tx.transaction(async (guard) => {
            await guard.execute(
              sql`insert into public.webhook_configuration(id,workspace_id,form_id,sealed_destination,created_by,verified_at) values(${crypto.randomUUID()}::uuid,${workspace.id}::uuid,${formId}::uuid,${'v1.' + 'A'.repeat(80)},${actor},now())`,
            );
          }),
        ).rejects.toMatchObject({ cause: { code: '42501' } });
        const otherForm = crypto.randomUUID();
        await createForm(tx, actor, workspace.id, {
          id: otherForm,
          definition: formFixture().definition,
        });
        await expect(
          tx.transaction(async (guard) => {
            await guard.execute(
              sql`insert into public.form_webhook_settings(workspace_id,form_id,configuration_id,updated_by) values(${workspace.id}::uuid,${otherForm}::uuid,${configurationId}::uuid,${actor})`,
            );
          }),
        ).rejects.toMatchObject({ cause: { code: '23503' } });
        expect(
          (
            await tx.execute(
              sql`select has_table_privilege(current_user,'public.webhook_configuration','UPDATE') as mutate,has_table_privilege(current_user,'public.webhook_configuration','DELETE') as remove,has_table_privilege('snapform_jobs','public.webhook_configuration','SELECT') as job_read`,
            )
          ).rows,
        ).toEqual([{ mutate: false, remove: false, job_read: false }]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}, 30000);

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
// A destination saved before today's target rules: same v1 format and
// context binding as sealWebhookDestination, without its URL validation.
async function sealLegacy(
  url: string,
  master: string,
  ids: [string, string, string],
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(master), (c) => c.charCodeAt(0)),
    'AES-GCM',
    false,
    ['encrypt'],
  );
  const sealed = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(
        `snapform-webhook-v1|${ids.join('|')}`,
      ),
    },
    key,
    new TextEncoder().encode(
      JSON.stringify({ url, secret: createWebhookSecret() }),
    ),
  );
  return `v1.${base64(iv)}.${base64(new Uint8Array(sealed))}`;
}

it('reports unreadable or now-invalid endpoints and lets owners replace them', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const master = base64(crypto.getRandomValues(new Uint8Array(32)));
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = Error('Rollback webhook attention fixture');
  try {
    await expect(
      db.transaction(async (tx) => {
        const actor = crypto.randomUUID();
        await tx.insert(user).values({
          id: actor,
          name: 'Webhook QA',
          email: `${actor}@example.invalid`,
          emailVerified: true,
        });
        const workspace = await createWorkspace(tx, actor, {
          id: crypto.randomUUID(),
          name: 'Webhook QA',
          segment: 'agency',
        });
        const forms = [crypto.randomUUID(), crypto.randomUUID()];
        const configurations = [crypto.randomUUID(), crypto.randomUUID()];
        const sealed = [
          // Rotated key: AES-GCM authentication fails.
          'v1.' + 'A'.repeat(80),
          // Readable, but its host is now denied for webhook targets.
          await sealLegacy('https://hooks.jacked.dev/legacy', master, [
            workspace.id,
            forms[1],
            configurations[1],
          ]),
        ];
        for (const [index, formId] of forms.entries()) {
          await createForm(tx, actor, workspace.id, {
            id: formId,
            definition: formFixture().definition,
          });
          await tx.execute(
            sql`insert into public.webhook_configuration(id,workspace_id,form_id,sealed_destination,created_by) values(${configurations[index]}::uuid,${workspace.id}::uuid,${formId}::uuid,${sealed[index]},${actor})`,
          );
          await tx.execute(
            sql`insert into public.form_webhook_settings(workspace_id,form_id,configuration_id,updated_by) values(${workspace.id}::uuid,${formId}::uuid,${configurations[index]}::uuid,${actor})`,
          );
          const settings = await getWebhookSettings(
            tx,
            actor,
            workspace.id,
            formId,
            master,
          );
          expect(settings).toEqual({
            enabled: false,
            revision: 1,
            configurationId: configurations[index],
            url: null,
            verifiedAt: null,
            attention: 'DESTINATION_UNAVAILABLE',
          });
          expect(JSON.stringify(settings)).not.toContain('jacked');
        }
        const toggle = (enabled: boolean, expectedRevision: number) =>
          configureWebhookDelivery(
            tx,
            actor,
            workspace.id,
            forms[0],
            { enabled, expectedRevision, configurationId: configurations[0] },
            master,
          );
        await expect(toggle(true, 1)).rejects.toThrow(
          'WEBHOOK_REPLACEMENT_REQUIRED',
        );
        expect(await toggle(false, 1)).toMatchObject({
          revision: 2,
          attention: 'DESTINATION_UNAVAILABLE',
        });
        const replacement = crypto.randomUUID();
        expect(
          await saveWebhookConfiguration(
            tx,
            actor,
            workspace.id,
            forms[0],
            {
              configurationId: replacement,
              expectedRevision: 2,
              url: 'https://hooks.example.com/replacement',
            },
            master,
          ),
        ).toEqual({
          enabled: false,
          revision: 3,
          configurationId: replacement,
          url: 'https://hooks.example.com/replacement',
          verifiedAt: null,
          attention: null,
        });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}, 30000);
