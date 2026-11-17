import { sql } from 'drizzle-orm';
import { publicationSchema } from '@snapform/contracts/publication';
import type { FormDefinition } from '@snapform/contracts/form';
import type { Database, Transaction } from './client.ts';
export async function resolvePublicForm(
  db: Database | Transaction,
  rawId: string,
) {
  const id = publicationSchema.shape.publicId.parse(rawId);
  // business_name and plan are read through to_jsonb so this query also works
  // before migrations 0044 and 0045 add those columns; they are then null.
  const result = await db.execute<{
    publicId: string;
    versionId: string;
    definition: FormDefinition;
    businessName: string | null;
    plan: string | null;
  }>(sql`select r.public_id as "publicId", r.version_id as "versionId",
    r.definition, to_jsonb(r) ->> 'business_name' as "businessName",
    to_jsonb(r) ->> 'plan' as "plan"
    from public.resolve_published_form(${id}::uuid) r`);
  return result.rows[0] || null;
}
