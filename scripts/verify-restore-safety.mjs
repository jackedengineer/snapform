// Operator-only regression: every write belongs to the disposable network-none
// restore. This script never accepts or opens a Neon database connection.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyIsolatedRestore } from './restore-postgres.mjs';
import { applyCurrentMigrations } from './restore-migrations.mjs';
import { replayPurgeIntents } from './purge-replay.mjs';
import { sealPurgeIntent } from '../packages/contracts/src/purge.ts';
import {
  readRestoredPendingIntents,
  applyRestoredPurgeIntent,
  quarantineRestoredCopy,
} from './restore-safety.mjs';

export async function inspectRestoreSafety({ executeSql }) {
  await applyCurrentMigrations(executeSql);
  const last = (value) => value.trim().split('\n').at(-1);
  const scalar = async (sql) => last(await executeSql(sql));
  async function fixture() {
    const ids = Object.fromEntries(
      [
        'actor',
        'workspace',
        'form',
        'version',
        'response',
        'event',
        'config',
      ].map((name) => [name, randomUUID()]),
    );
    await executeSql(`BEGIN;
INSERT INTO public."user"(id,name,email,email_verified) VALUES('${ids.actor}','Restore QA','${ids.actor}@example.invalid',true);
INSERT INTO public.workspace(id,name,segment,created_by) VALUES('${ids.workspace}','Restore QA','agency','${ids.actor}');
INSERT INTO public.membership(workspace_id,user_id,role) VALUES('${ids.workspace}','${ids.actor}','owner');
INSERT INTO public.form(id,workspace_id,created_by) VALUES('${ids.form}','${ids.workspace}','${ids.actor}');
INSERT INTO public.form_version(id,workspace_id,form_id,number,source_revision,definition,created_by)
 VALUES('${ids.version}','${ids.workspace}','${ids.form}',1,1,'{"contractVersion":1}','${ids.actor}');
INSERT INTO public.response_session(id,workspace_id,form_id,version_id,capability_hash,expires_at)
 VALUES('${ids.response}','${ids.workspace}','${ids.form}','${ids.version}','${ids.response.replaceAll('-', '').repeat(2)}',now()+interval '7 days');
INSERT INTO public.response_outbox(id,workspace_id,form_id,version_id,session_id)
 VALUES('${ids.event}','${ids.workspace}','${ids.form}','${ids.version}','${ids.response}');
COMMIT;`);
    return ids;
  }
  const removedWorkspace = await fixture(),
    removedResponse = await fixture(),
    survivor = await fixture();
  const response = {
    id: randomUUID(),
    workspaceId: removedResponse.workspace,
    kind: 'response',
    targetId: removedResponse.response,
    reason: 'expired',
    createdAt: '2026-01-01T00:00:00.123Z',
  };
  const workspace = {
    id: randomUUID(),
    workspaceId: removedWorkspace.workspace,
    kind: 'workspace',
    targetId: removedWorkspace.workspace,
    reason: 'owner',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  await executeSql(`INSERT INTO public.purge_intent(id,workspace_id,kind,target_id,reason,created_at)
 VALUES('${response.id}','${response.workspaceId}','response','${response.targetId}','expired','2026-01-01T00:00:00.123456Z');`);
  // A pending SQL record older than R2's retention must block quarantine until replay.
  await assert.rejects(
    quarantineRestoredCopy(executeSql),
    /RESTORE_QUARANTINE_FAILED/,
  );
  assert.equal(
    await scalar(
      `SELECT count(*) FROM public.response_session WHERE id='${removedResponse.response}';`,
    ),
    '1',
  );
  const pending = await readRestoredPendingIntents(executeSql);
  assert.deepEqual(
    pending.find((item) => item.id === response.id),
    response,
  );
  // Same ID with changed metadata and same target with changed ID both fail without deletion.
  for (const conflicting of [
    { ...response, reason: 'owner' },
    { ...response, id: randomUUID() },
    { ...response, workspaceId: survivor.workspace },
  ])
    await assert.rejects(
      applyRestoredPurgeIntent(executeSql, conflicting),
      /RESTORE_PURGE_FAILED/,
    );
  assert.equal(
    await scalar(
      `SELECT count(*) FROM public.response_session WHERE id='${removedResponse.response}';`,
    ),
    '1',
  );
  const secret = Buffer.alloc(32, 13).toString('base64'); // Synthetic, never the production key.
  const ledger = new Map();
  const objects = [];
  for (const item of [response, workspace]) {
    const key = `intents/${item.id}.enc`,
      body = await sealPurgeIntent(item, secret);
    ledger.set(key, body);
    objects.push({ key, body });
  }
  const result = await replayPurgeIntents({
    pending,
    objects,
    secret,
    persist: async (item) => {
      const key = `intents/${item.id}.enc`;
      if (!ledger.has(key))
        ledger.set(key, await sealPurgeIntent(item, secret));
      return true;
    },
    apply: (item) => applyRestoredPurgeIntent(executeSql, item),
  });
  assert.equal(result.trafficSafe, false);
  assert.equal(
    await scalar(
      `SELECT count(*) FROM public.workspace WHERE id='${removedWorkspace.workspace}';`,
    ),
    '0',
  );
  assert.equal(
    await scalar(
      `SELECT count(*) FROM public.response_session WHERE id='${removedResponse.response}';`,
    ),
    '0',
  );
  assert.equal(
    await scalar(
      `SELECT count(*) FROM public.workspace WHERE id='${removedResponse.workspace}';`,
    ),
    '1',
  );
  assert.equal(await applyRestoredPurgeIntent(executeSql, response), true);
  assert.equal(await applyRestoredPurgeIntent(executeSql, workspace), true);
  await assert.rejects(
    executeSql(
      `INSERT INTO public.workspace(id,name,segment,created_by) VALUES('${workspace.targetId}','Blocked','agency','${removedWorkspace.actor}');`,
    ),
  );
  await assert.rejects(
    executeSql(`INSERT INTO public.response_session(id,workspace_id,form_id,version_id,capability_hash,expires_at)
 VALUES('${response.targetId}','${removedResponse.workspace}','${removedResponse.form}','${removedResponse.version}','${'1'.repeat(64)}',now()+interval '1 day');`),
  );
  const password = 'synthetic-password-hash';
  await executeSql(`BEGIN;
INSERT INTO public.session(id,user_id,token,expires_at) VALUES('${randomUUID()}','${survivor.actor}','${randomUUID()}',now()+interval '1 day');
INSERT INTO public.verification(id,identifier,value,expires_at) VALUES('${randomUUID()}','synthetic','synthetic',now()+interval '1 day');
INSERT INTO public.account(id,account_id,provider_id,user_id,password,access_token,refresh_token,id_token)
 VALUES('${randomUUID()}','${survivor.actor}','credential','${survivor.actor}','${password}','synthetic','synthetic','synthetic');
INSERT INTO public.response_email_delivery(event_id,workspace_id,form_id,session_id,recipient_user_id,recipient_email,settings_revision,status,attempts,first_attempt_at,lease_token,lease_until)
 VALUES('${survivor.event}','${survivor.workspace}','${survivor.form}','${survivor.response}','${survivor.actor}','${survivor.actor}@example.invalid',1,'sending',1,now(),gen_random_uuid(),now()+interval '1 minute');
INSERT INTO public.webhook_configuration(id,workspace_id,form_id,sealed_destination,created_by)
 VALUES('${survivor.config}','${survivor.workspace}','${survivor.form}','v1.'||repeat('x',80),'${survivor.actor}');
INSERT INTO public.webhook_delivery(workspace_id,form_id,configuration_id,version_id,event_id,session_id,kind,status,reason)
 VALUES('${survivor.workspace}','${survivor.form}','${survivor.config}','${survivor.version}','${survivor.event}','${survivor.response}','response.submitted','unknown','receiver-unconfirmed');
COMMIT;`);
  const oldHash = await scalar(
    `SELECT capability_hash FROM public.response_session WHERE id='${survivor.response}';`,
  );
  assert.equal(await quarantineRestoredCopy(executeSql), true);
  assert.equal(await scalar(`SELECT count(*) FROM public.session;`), '0');
  assert.equal(await scalar(`SELECT count(*) FROM public.verification;`), '0');
  assert.equal(
    await scalar(
      `SELECT count(*) FROM public.account WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL OR id_token IS NOT NULL;`,
    ),
    '0',
  );
  assert.equal(
    await scalar(
      `SELECT password='${password}' FROM public.account WHERE user_id='${survivor.actor}';`,
    ),
    't',
  );
  assert.notEqual(
    await scalar(
      `SELECT capability_hash FROM public.response_session WHERE id='${survivor.response}';`,
    ),
    oldHash,
  );
  for (const table of ['response_email_delivery', 'webhook_delivery']) {
    assert.equal(
      await scalar(
        `SELECT status='cancelled' AND reason='disabled' AND lease_token IS NULL AND lease_until IS NULL FROM public.${table} WHERE event_id='${survivor.event}';`,
      ),
      't',
    );
  }
  assert.equal(
    await scalar(
      'SELECT count(*) FROM public.response_outbox WHERE completed_at IS NULL OR lease_token IS NOT NULL OR lease_until IS NOT NULL;',
    ),
    '0',
  );
  assert.equal(await quarantineRestoredCopy(executeSql), true);
  return {
    replayed: result.replayed,
    idempotent: true,
    quarantineVerified: true,
    trafficSafe: false,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    let safety;
    const restore = await verifyIsolatedRestore({
      manifestPath: resolve(process.argv[2]),
      secret: process.env.BACKUP_ENCRYPTION_KEY,
      workDirectory: '.recovery',
      inspect: async (context) => {
        safety = await inspectRestoreSafety(context);
      },
    });
    console.log(
      JSON.stringify({
        event: 'isolated_restore_safety_verified',
        migrations: restore.migrations,
        ...safety,
        cleanupCompleted: true,
      }),
    );
  } catch {
    console.error(JSON.stringify({ event: 'isolated_restore_safety_failed' }));
    process.exitCode = 1;
  }
}
