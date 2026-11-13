import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  date,
  timestamp,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { workspace } from './workspace-schema.ts';
// No runtime grants or policies: only SECURITY DEFINER functions in 0041 read or write.
// A missing row means Free; Pro lasts only while current_period_end is in the future.
export const workspacePlan = pgTable(
  'workspace_plan',
  {
    workspaceId: uuid('workspace_id')
      .primaryKey()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    plan: text('plan', { enum: ['free', 'pro'] })
      .notNull()
      .default('free'),
    status: text('status', {
      enum: ['none', 'created', 'active', 'halted', 'cancelled', 'completed'],
    })
      .notNull()
      .default('none'),
    billingInterval: text('billing_interval', { enum: ['monthly', 'annual'] }),
    currency: text('currency', { enum: ['INR', 'USD'] }),
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    razorpaySubscriptionId: text('razorpay_subscription_id').unique(),
    razorpayCustomerId: text('razorpay_customer_id'),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('workspace_plan_plan', sql`${table.plan} in ('free','pro')`),
    check(
      'workspace_plan_status',
      sql`${table.status} in ('none','created','active','halted','cancelled','completed')`,
    ),
    check(
      'workspace_plan_interval',
      sql`${table.billingInterval} is null or ${table.billingInterval} in ('monthly','annual')`,
    ),
    check(
      'workspace_plan_currency',
      sql`${table.currency} is null or ${table.currency} in ('INR','USD')`,
    ),
    check(
      'workspace_plan_period',
      sql`${table.currentPeriodEnd} is null or ${table.currentPeriodStart} is null or ${table.currentPeriodEnd}>${table.currentPeriodStart}`,
    ),
    check(
      'workspace_plan_provider_ids',
      sql`(${table.razorpaySubscriptionId} is null or ${table.razorpaySubscriptionId} ~ '^sub_[A-Za-z0-9]{1,40}$') and (${table.razorpayCustomerId} is null or ${table.razorpayCustomerId} ~ '^cust_[A-Za-z0-9]{1,40}$')`,
    ),
  ],
).enableRLS();
// Consumed responses per UTC calendar month. Independent of deletable sessions.
export const workspaceResponseUsage = pgTable(
  'workspace_response_usage',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    periodStart: date('period_start').notNull(),
    responsesUsed: integer('responses_used').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.periodStart] }),
    check('workspace_response_usage_bounds', sql`${table.responsesUsed} >= 0`),
    check(
      'workspace_response_usage_month',
      sql`extract(day from ${table.periodStart}) = 1`,
    ),
  ],
).enableRLS();
// Provider event receipts for dedupe. No payload or customer details are kept.
export const billingEvent = pgTable(
  'billing_event',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    subscriptionId: text('subscription_id'),
    outcome: text('outcome', { enum: ['applied', 'ignored'] }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('billing_event_id', sql`${table.id} ~ '^[A-Za-z0-9_-]{1,64}$'`),
    check('billing_event_type', sql`${table.type} ~ '^[a-z_.]{1,64}$'`),
    check(
      'billing_event_outcome',
      sql`${table.outcome} in ('applied','ignored')`,
    ),
  ],
).enableRLS();
