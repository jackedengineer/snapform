import { sql } from 'drizzle-orm';
import {
  capabilityHashSchema,
  intakeEnvelopeSchema,
} from '@snapform/contracts/intake';
import type { Database, Transaction } from './client.ts';
type Connection = Database | Transaction;
const identity = intakeEnvelopeSchema.shape.session.shape.id;
async function scope(
  tx: Transaction,
  publicId: string,
  id: string,
  hash: string,
) {
  await tx.execute(sql`select
    set_config('snapform.user_id','',true),set_config('snapform.workspace_id','',true),set_config('snapform.role','',true),
    set_config('snapform.public_id',${publicId},true),set_config('snapform.intake_id',${id},true),set_config('snapform.intake_hash',${hash},true)`);
}
async function read(tx: Transaction, id: string) {
  const result = await tx.execute<
    Record<string, unknown>
  >(sql`select id,public_id as "publicId",version_id as "versionId",definition,revision,answers,
      to_char(expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "expiresAt",status
    from public.read_response_session(${id}::uuid)`);
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
  return db.transaction(async (tx) => {
    await scope(tx, publicId, id, hash);
    const created = await tx.execute<{ id: string | null }>(
      sql`select public.start_response_session(${publicId}::uuid,${id}::uuid,${hash}) as id`,
    );
    if (!created.rows[0]?.id) throw new Error('INTAKE_UNAVAILABLE');
    return read(tx, id);
  });
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
  return db.transaction(async (tx) => {
    await scope(tx, publicId, id, hash);
    return read(tx, id);
  });
}
