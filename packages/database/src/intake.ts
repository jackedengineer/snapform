import {
  intakeMutationSchema,
  intakeMutationReceiptSchema,
  prepareIntakeProgress,
} from '@snapform/contracts/intake-progress';
import type { IntakeMutation } from '@snapform/contracts/intake-progress';
import type { CompileIssue } from '@snapform/contracts/compile';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import {
  capabilityHashSchema,
  intakeEnvelopeSchema,
} from '@snapform/contracts/intake';
import type { Database, Transaction } from './client.ts';
type Connection = Database | Transaction;
const identity = intakeEnvelopeSchema.shape.session.shape.id;
async function read(db: Connection, source: SQL) {
  const result = await db.execute<
    Record<string, unknown>
  >(sql`select id,public_id as "publicId",version_id as "versionId",definition,revision,answers,
      to_char(expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "expiresAt",status
    from ${source}`);
  const session = result.rows[0];
  if (!session) throw new Error('INTAKE_UNAVAILABLE');
  return intakeEnvelopeSchema.parse({ session }).session;
}
export async function startIntake(
  db: Connection,
  publicId: string,
  id: string,
  rawHash: string,
) {
  publicId = identity.parse(publicId);
  id = identity.parse(id);
  const hash = capabilityHashSchema.parse(rawHash);
  return read(
    db,
    sql`public.open_intake_session(${publicId}::uuid,${id}::uuid,${hash})`,
  );
}
export async function getIntake(
  db: Connection,
  publicId: string,
  id: string,
  rawHash: string,
) {
  publicId = identity.parse(publicId);
  id = identity.parse(id);
  const hash = capabilityHashSchema.parse(rawHash);
  return read(
    db,
    sql`public.resume_intake_session(${publicId}::uuid,${id}::uuid,${hash})`,
  );
}

export async function mutateIntake(
  db: Connection,
  publicId: string,
  id: string,
  rawHash: string,
  kind: 'save' | 'submit',
  raw: IntakeMutation,
) {
  publicId = identity.parse(publicId);
  id = identity.parse(id);
  const hash = capabilityHashSchema.parse(rawHash),
    input = intakeMutationSchema.parse(raw);
  const current = await getIntake(db, publicId, id, hash);
  if (
    current.definition.pages.some((page) =>
      page.blocks.some((block) => block.type === 'file'),
    )
  )
    throw new Error('FILE_COLLECTION_UNAVAILABLE');
  const prepared = prepareIntakeProgress(
    current.definition,
    input.answers,
    kind === 'submit',
  );
  if (!prepared.ok) throw new IntakeValidationError(prepared.issues);
  const result = await db.execute<{
    outcome: string;
    revision: number;
    current_revision: number;
    status: string;
  }>(
    sql`select * from public.write_intake_session(${publicId}::uuid,${id}::uuid,${hash},${input.operationId}::uuid,${input.expectedRevision},${kind},${JSON.stringify(input.answers)}::jsonb,${JSON.stringify(prepared.answers)}::jsonb,${prepared.endingId}::uuid)`,
  );
  const receipt = result.rows[0];
  if (!receipt || receipt.outcome !== 'ok')
    throw new Error(receipt?.outcome || 'INTAKE_UNAVAILABLE');
  return intakeMutationReceiptSchema.parse({
    operationId: input.operationId,
    revision: receipt.revision,
    currentRevision: receipt.current_revision,
    status: receipt.status,
  });
}

export class IntakeValidationError extends Error {
  constructor(readonly issues: CompileIssue[]) {
    super('INVALID_INTAKE_ANSWERS');
  }
}
