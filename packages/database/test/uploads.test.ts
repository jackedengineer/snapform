// Pending until migration 0046 is applied to the shared database.
import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import type { Transaction } from '../src/client.ts';
import { saveDraft } from '../src/forms.ts';
import { publishForm } from '../src/publication.ts';
import { startIntake, mutateIntake, getIntake } from '../src/intake.ts';
import { applyBillingEvent } from '../src/billing.ts';
import { getResponse } from '../src/responses.ts';
import { getResponseExport } from '../src/response-export.ts';
import { scheduleDeletion } from '../src/deletion.ts';
import {
  authorizeUpload,
  discardUnreferencedUploads,
  getResponseFile,
  listResponseFiles,
  listUploads,
  recordUpload,
  removeUpload,
} from '../src/uploads.ts';
import type { StoredUpload } from '../src/uploads.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
import { seedForm } from './fixtures/forms.ts';

type Seed = Awaited<ReturnType<typeof seedForm>>;
async function fixture(run: (tx: Transaction, seed: Seed) => Promise<void>) {
  if (!process.env.DATABASE_URL)
    throw new Error('Runtime database configuration is required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL),
    rollback = new Error('Rollback upload fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        await run(tx, await seedForm(tx, 'Upload QA'));
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}
const day = 86400000;
async function makePro(tx: Transaction, seed: Seed) {
  expect(
    await applyBillingEvent(tx, {
      id: 'evt_' + crypto.randomUUID().replaceAll('-', ''),
      type: 'subscription.activated',
      createdAt: new Date(Date.now() - 60000),
      workspaceId: seed.workspaceId,
      subscriptionId:
        'sub_QA' + crypto.randomUUID().replaceAll('-', '').slice(0, 12),
      customerId: 'cust_QA0000000001',
      interval: 'monthly',
      currency: 'INR',
      periodStart: new Date(Date.now() - day),
      periodEnd: new Date(Date.now() + 29 * day),
    }),
  ).toBe('applied');
}
// Adds an optional two-file question and publishes it.
async function publishFileForm(tx: Transaction, seed: Seed) {
  const { definition } = formFixture();
  const question = crypto.randomUUID();
  definition.pages[0].blocks.push({
    id: question,
    type: 'file',
    label: 'Brief',
    description: '',
    required: false,
    aiEnabled: false,
    maxFiles: 2,
  });
  await saveDraft(tx, seed.actor, seed.workspaceId, seed.formId, {
    operationId: crypto.randomUUID(),
    expectedRevision: 1,
    definition,
  });
  const published = await publishForm(
    tx,
    seed.actor,
    seed.workspaceId,
    seed.formId,
    { versionId: crypto.randomUUID(), expectedRevision: 2 },
  );
  if (!published.publication) throw Error('Expected publication');
  return { publicId: published.publication.publicId, question };
}
const random = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
function stored(
  seed: Seed,
  session: string,
  question: string,
  change: Partial<StoredUpload> = {},
): StoredUpload {
  return {
    id: crypto.randomUUID(),
    questionId: question,
    key: `${seed.workspaceId}/${seed.formId}/${session}/${random()}`,
    name: 'Brief.pdf',
    type: 'application/pdf',
    size: 2048,
    sha256: 'a'.repeat(64),
    ...change,
  };
}
const denied = (tx: Transaction, query: ReturnType<typeof sql>) =>
  expect(
    tx.transaction(async (savepoint) => savepoint.execute(query)),
  ).rejects.toThrow();

it(
  'refuses file questions and uploads on Free',
  async () =>
    fixture(async (tx, seed) => {
      await expect(publishFileForm(tx, seed)).rejects.toThrow(
        'UPLOADS_REQUIRE_PRO',
      );
      // A file form that went live on Pro stays live after a downgrade.
      const [draft] = (
        await tx.execute<{ definition: unknown }>(
          sql`select definition from public.form_draft where form_id=${seed.formId}::uuid`,
        )
      ).rows;
      const version = crypto.randomUUID(),
        publicId = crypto.randomUUID();
      await tx.execute(
        sql`select set_config('snapform.user_id',${seed.actor},true),set_config('snapform.workspace_id',${seed.workspaceId},true),set_config('snapform.role','owner',true)`,
      );
      await tx.execute(
        sql`insert into public.form_version(id,workspace_id,form_id,number,source_revision,definition,created_by) values(${version}::uuid,${seed.workspaceId}::uuid,${seed.formId}::uuid,1,2,${JSON.stringify(draft.definition)}::jsonb,${seed.actor})`,
      );
      await tx.execute(
        sql`insert into public.form_publication(workspace_id,form_id,public_id,version_id,active,updated_by) values(${seed.workspaceId}::uuid,${seed.formId}::uuid,${publicId}::uuid,${version}::uuid,true,${seed.actor})`,
      );
      const question = (
        draft.definition as {
          pages: { blocks: { id: string; type: string }[] }[];
        }
      ).pages[0].blocks.find((block) => block.type === 'file')?.id;
      if (!question) throw Error('Expected a file question');
      const session = crypto.randomUUID(),
        hash = '1'.repeat(64);
      await startIntake(tx, publicId, session, hash);
      expect(
        (await authorizeUpload(tx, publicId, session, hash, question)).outcome,
      ).toBe('UPLOADS_UNAVAILABLE');
      expect(
        await recordUpload(
          tx,
          publicId,
          session,
          hash,
          stored(seed, session, question),
        ),
      ).toBe('UPLOADS_UNAVAILABLE');
    }),
  30000,
);
it(
  'admits, records, lists and removes only a session’s own files within the limit',
  async () =>
    fixture(async (tx, seed) => {
      await makePro(tx, seed);
      const { publicId, question } = await publishFileForm(tx, seed);
      const session = crypto.randomUUID(),
        other = crypto.randomUUID(),
        hash = '2'.repeat(64),
        otherHash = '3'.repeat(64);
      await startIntake(tx, publicId, session, hash);
      await startIntake(tx, publicId, other, otherHash);
      expect(
        await authorizeUpload(tx, publicId, session, hash, question),
      ).toEqual({
        outcome: 'ok',
        workspaceId: seed.workspaceId,
        formId: seed.formId,
      });
      for (const [requested, credential, target, outcome] of [
        [session, otherHash, question, 'INTAKE_UNAVAILABLE'],
        [session, hash, crypto.randomUUID(), 'FILE_QUESTION_UNAVAILABLE'],
        [session, hash, seed.fieldIds.budget, 'FILE_QUESTION_UNAVAILABLE'],
      ])
        expect(
          (await authorizeUpload(tx, publicId, requested, credential, target))
            .outcome,
        ).toBe(outcome);
      const first = stored(seed, session, question);
      expect(await recordUpload(tx, publicId, session, hash, first)).toBe('ok');
      // Another session's prefix, a forged key or a foreign capability fails.
      for (const [file, credential, outcome] of [
        [stored(seed, other, question), hash, 'INVALID_FILE'],
        [
          stored(seed, session, question, { key: 'a/b/c/' + random() }),
          hash,
          'INVALID_FILE',
        ],
        [stored(seed, session, question), otherHash, 'INTAKE_UNAVAILABLE'],
        [
          stored(seed, session, question, { id: first.id }),
          hash,
          'INVALID_FILE',
        ],
      ] as const)
        expect(
          await recordUpload(tx, publicId, session, credential, file),
        ).toBe(outcome);
      const second = stored(seed, session, question, { name: 'تقرير.png' });
      expect(await recordUpload(tx, publicId, session, hash, second)).toBe(
        'ok',
      );
      expect(
        await recordUpload(
          tx,
          publicId,
          session,
          hash,
          stored(seed, session, question),
        ),
      ).toBe('FILE_LIMIT_REACHED');
      expect(await listUploads(tx, publicId, session, hash)).toEqual([
        {
          id: first.id,
          questionId: question,
          name: 'Brief.pdf',
          size: 2048,
          type: 'application/pdf',
        },
        expect.objectContaining({ id: second.id, name: 'تقرير.png' }),
      ]);
      expect(await listUploads(tx, publicId, other, otherHash)).toEqual([]);
      await expect(
        listUploads(tx, publicId, session, otherHash),
      ).rejects.toThrow('INTAKE_UNAVAILABLE');
      expect(
        await removeUpload(tx, publicId, other, otherHash, first.id),
      ).toBeNull();
      expect(await removeUpload(tx, publicId, session, hash, second.id)).toBe(
        second.key,
      );
      expect(
        await removeUpload(tx, publicId, session, hash, second.id),
      ).toBeNull();
      // The runtime has no direct write path to file rows.
      await denied(
        tx,
        sql`insert into public.response_file(id) values(gen_random_uuid())`,
      );
      await denied(tx, sql`delete from public.response_file`);
      await denied(tx, sql`select public.purge_file_prefix(gen_random_uuid())`);
      await denied(
        tx,
        sql`select * from public.webhook_delivery_files(gen_random_uuid(),gen_random_uuid())`,
      );
    }),
  40000,
);
it(
  'submits only own file references and shows members names, never other tenants',
  async () =>
    fixture(async (tx, seed) => {
      await makePro(tx, seed);
      const { publicId, question } = await publishFileForm(tx, seed);
      const session = crypto.randomUUID(),
        other = crypto.randomUUID(),
        hash = '4'.repeat(64),
        otherHash = '5'.repeat(64);
      await startIntake(tx, publicId, session, hash);
      await startIntake(tx, publicId, other, otherHash);
      const mine = stored(seed, session, question),
        dropped = stored(seed, session, question, { name: 'old.pdf' }),
        theirs = stored(seed, other, question);
      for (const [id, credential, file] of [
        [session, hash, mine],
        [session, hash, dropped],
        [other, otherHash, theirs],
      ] as const)
        expect(await recordUpload(tx, publicId, id, credential, file)).toBe(
          'ok',
        );
      const answers = (files: string[]) => ({
        [seed.fieldIds.budget]: { state: 'value' as const, value: 0 },
        [seed.fieldIds.contact]: {
          state: 'value' as const,
          value: 'qa@example.invalid',
        },
        [question]: { state: 'value' as const, value: files },
      });
      const submit = (files: string[]) =>
        mutateIntake(tx, publicId, session, hash, 'submit', {
          operationId: crypto.randomUUID(),
          expectedRevision: 1,
          answers: answers(files),
        });
      for (const files of [[theirs.id], [mine.id, crypto.randomUUID()]])
        await expect(submit(files)).rejects.toThrow('INVALID_INTAKE_ANSWERS');
      expect((await getIntake(tx, publicId, session, hash)).status).toBe(
        'collecting',
      );
      expect((await submit([mine.id])).status).toBe('submitted');
      await expect(
        removeUpload(tx, publicId, session, hash, mine.id),
      ).rejects.toThrow('INTAKE_ALREADY_SUBMITTED');
      expect(
        await discardUnreferencedUploads(tx, publicId, session, hash),
      ).toEqual([dropped.key]);
      expect(
        await discardUnreferencedUploads(tx, publicId, other, otherHash),
      ).toEqual([]);
      const detail = await getResponse(
        tx,
        seed.actor,
        seed.workspaceId,
        seed.formId,
        session,
      );
      const files = await listResponseFiles(
        tx,
        seed.actor,
        seed.workspaceId,
        seed.formId,
        session,
      );
      expect(files).toEqual([
        expect.objectContaining({ id: mine.id, name: 'Brief.pdf' }),
      ]);
      expect(JSON.stringify([detail, files])).not.toContain(mine.key);
      // An unfinished session lists nothing to members.
      expect(
        await listResponseFiles(
          tx,
          seed.actor,
          seed.workspaceId,
          seed.formId,
          other,
        ),
      ).toEqual([]);
      const exported = await getResponseExport(
        tx,
        seed.actor,
        seed.workspaceId,
        seed.formId,
        detail.versionId,
      );
      expect(exported.rows[0]).toMatchObject({
        files: [expect.objectContaining({ id: mine.id })],
      });
      expect(
        await getResponseFile(
          tx,
          seed.actor,
          seed.workspaceId,
          seed.formId,
          session,
          mine.id,
        ),
      ).toEqual({
        key: mine.key,
        name: 'Brief.pdf',
        type: 'application/pdf',
        size: 2048,
      });
      // An unfinished session's files are not readable by members.
      await expect(
        getResponseFile(
          tx,
          seed.actor,
          seed.workspaceId,
          seed.formId,
          other,
          theirs.id,
        ),
      ).rejects.toThrow('FILE_NOT_FOUND');
      const outsider = await seedForm(tx, 'Upload outsider');
      await expect(
        getResponseFile(
          tx,
          outsider.actor,
          seed.workspaceId,
          seed.formId,
          session,
          mine.id,
        ),
      ).rejects.toThrow('WORKSPACE_NOT_FOUND');
      // A response awaiting deletion (0045) no longer serves its files.
      await scheduleDeletion(
        tx,
        seed.actor,
        seed.workspaceId,
        { kind: 'response', targetId: session },
        {
          requestId: crypto.randomUUID(),
          confirmation: 'DELETE',
          acknowledgeDeletion: true,
        },
      );
      await expect(
        getResponseFile(
          tx,
          seed.actor,
          seed.workspaceId,
          seed.formId,
          session,
          mine.id,
        ),
      ).rejects.toThrow('FILE_NOT_FOUND');
      expect(
        await listResponseFiles(
          tx,
          seed.actor,
          seed.workspaceId,
          seed.formId,
          session,
        ),
      ).toEqual([]);
    }),
  40000,
);
