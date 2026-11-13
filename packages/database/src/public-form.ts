import { sql } from 'drizzle-orm';
import { publicationSchema } from '@snapform/contracts/publication';
import type { FormDefinition } from '@snapform/contracts/form';
import type { Database, Transaction } from './client.ts';
export async function resolvePublicForm(
  db: Database | Transaction,
  rawId: string,
) {
  const id = publicationSchema.shape.publicId.parse(rawId);
  // business_name is read through to_jsonb so this query also works before
  // migration 0044 adds the column; the name is then null.
  const result = await db.execute<{
    publicId: string;
    versionId: string;
    definition: FormDefinition;
    businessName: string | null;
  }>(sql`select r.public_id as "publicId", r.version_id as "versionId",
    r.definition, to_jsonb(r) ->> 'business_name' as "businessName"
    from public.resolve_published_form(${id}::uuid) r`);
  return result.rows[0] || null;
}
