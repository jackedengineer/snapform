import { sql } from 'drizzle-orm';
import { publicationSchema } from '@snapform/contracts/publication';
import type { FormDefinition } from '@snapform/contracts/form';
import type { Database, Transaction } from './client.ts';
export async function resolvePublicForm(
  db: Database | Transaction,
  rawId: string,
) {
  const id = publicationSchema.shape.publicId.parse(rawId);
  const result = await db.execute<{
    publicId: string;
    versionId: string;
    definition: FormDefinition;
  }>(sql`select public_id as "publicId", version_id as "versionId", definition
    from public.resolve_published_form(${id}::uuid)`);
  return result.rows[0] || null;
}
