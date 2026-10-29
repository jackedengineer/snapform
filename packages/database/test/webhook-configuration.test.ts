import { expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { membership } from '../src/workspace-schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm } from '../src/forms.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
import {
  getWebhookSettings,
  getWebhookSigningSecret,
  saveWebhookConfiguration,
} from '../src/webhook-settings.ts';
import { webhookConfiguration } from '../src/webhook-schema.ts';
import { openWebhookDestination } from '../../contracts/src/webhook-crypto.ts';
it('saves immutable encrypted configurations and checks current revisions and actual membership', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL),
    rollback = Error('Rollback webhook configuration fixture');
  try {
    await expect(
      db.transaction(async (tx) => {
        const actor = crypto.randomUUID(),
          formId = crypto.randomUUID(),
          configurationId = crypto.randomUUID();
        const master = Buffer.alloc(32, 7).toString('base64');
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
        expect(
          await getWebhookSettings(tx, actor, workspace.id, formId, master),
        ).toEqual({
          enabled: false,
          revision: 0,
          configurationId: null,
          url: null,
          verifiedAt: null,
        });
        const input = {
          configurationId,
          url: 'https://HOOKS.example.com/intake',
          expectedRevision: 0,
        };
        expect(
          await saveWebhookConfiguration(
            tx,
            actor,
            workspace.id,
            formId,
            input,
            master,
          ),
        ).toMatchObject({
          enabled: false,
          revision: 1,
          configurationId,
          url: 'https://hooks.example.com/intake',
          verifiedAt: null,
        });
        await expect(
          saveWebhookConfiguration(
            tx,
            actor,
            workspace.id,
            formId,
            { ...input, configurationId: crypto.randomUUID() },
            master,
          ),
        ).rejects.toThrow('WEBHOOK_SETTINGS_CONFLICT');
        await expect(
          saveWebhookConfiguration(
            tx,
            actor,
            workspace.id,
            formId,
            { ...input, expectedRevision: 1, url: 'http://localhost/' },
            master,
          ),
        ).rejects.toThrow();
        const stored = await tx
          .select()
          .from(webhookConfiguration)
          .where(eq(webhookConfiguration.id, configurationId));
        expect(stored).toHaveLength(1);
        expect(stored[0].sealedDestination).not.toContain('hooks.example.com');
        const destination = await openWebhookDestination(
          stored[0].sealedDestination,
          master,
          { workspaceId: workspace.id, formId, configurationId },
        );
        expect(destination.url).toBe('https://hooks.example.com/intake');
        expect(destination.secret.startsWith('whsec_')).toBe(true);
        expect(
          await getWebhookSigningSecret(
            tx,
            actor,
            workspace.id,
            formId,
            { configurationId, expectedRevision: 1 },
            master,
          ),
        ).toEqual({ secret: destination.secret });
        await expect(
          getWebhookSigningSecret(
            tx,
            actor,
            workspace.id,
            formId,
            { configurationId, expectedRevision: 2 },
            master,
          ),
        ).rejects.toThrow('WEBHOOK_SETTINGS_CONFLICT');

        const next = await saveWebhookConfiguration(
          tx,
          actor,
          workspace.id,
          formId,
          {
            configurationId: crypto.randomUUID(),
            expectedRevision: 1,
            url: 'https://hooks.example.com/new',
          },
          master,
        );
        expect(next).toMatchObject({
          revision: 2,
          enabled: false,
          verifiedAt: null,
        });
        expect(
          await tx
            .select()
            .from(webhookConfiguration)
            .where(eq(webhookConfiguration.id, configurationId)),
        ).toEqual(stored);
        const viewer = crypto.randomUUID();
        await tx.insert(user).values({
          id: viewer,
          name: 'Viewer QA',
          email: `${viewer}@example.invalid`,
        });
        await tx.insert(membership).values({
          workspaceId: workspace.id,
          userId: viewer,
          role: 'viewer',
        });
        await expect(
          getWebhookSettings(tx, viewer, workspace.id, formId, master),
        ).rejects.toThrow('FORBIDDEN');
        await expect(
          saveWebhookConfiguration(
            tx,
            viewer,
            workspace.id,
            formId,
            { ...input, expectedRevision: 2 },
            master,
          ),
        ).rejects.toThrow('FORBIDDEN');
        await expect(
          getWebhookSigningSecret(
            tx,
            viewer,
            workspace.id,
            formId,
            { configurationId: configurationId, expectedRevision: 2 },
            master,
          ),
        ).rejects.toThrow('FORBIDDEN');
        await tx.execute(
          sql`select set_config('snapform.user_id',${viewer},true),set_config('snapform.workspace_id',${workspace.id},true),set_config('snapform.role','owner',true)`,
        );
        expect(
          await tx
            .select()
            .from(webhookConfiguration)
            .where(eq(webhookConfiguration.formId, formId)),
        ).toHaveLength(0);
        await expect(
          getWebhookSettings(
            tx,
            crypto.randomUUID(),
            workspace.id,
            formId,
            master,
          ),
        ).rejects.toThrow('WORKSPACE_NOT_FOUND');
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}, 30000);
