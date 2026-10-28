import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

// Form resources require actual membership as well as the selected transaction context.
// A forged/stale role setting alone cannot grant write access.
export function tenantAccess(column: AnyPgColumn, mode: 'read' | 'write') {
  return sql`${column}::text = current_setting('snapform.workspace_id', true)
    and exists (select 1 from public.membership m
      where m.workspace_id = ${column}
        and m.user_id = current_setting('snapform.user_id', true)
        and ${mode === 'write' ? sql`m.role in ('owner', 'editor')` : sql`true`})`;
}
