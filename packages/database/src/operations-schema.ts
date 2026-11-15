import { sql } from 'drizzle-orm';
import { pgTable, integer, timestamp, check } from 'drizzle-orm/pg-core';
export const jobsHeartbeat = pgTable(
  'jobs_heartbeat',
  {
    id: integer('id').primaryKey().default(1),
    succeededAt: timestamp('succeeded_at', { withTimezone: true }).notNull(),
  },
  (table) => [check('jobs_heartbeat_singleton', sql`${table.id}=1`)],
).enableRLS();
