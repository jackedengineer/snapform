import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './packages/database/src/schema.ts',
    './packages/database/src/workspace-schema.ts',
    './packages/database/src/form-schema.ts',
    './packages/database/src/publication-schema.ts',
    './packages/database/src/intake-schema.ts',
    './packages/database/src/outbox-schema.ts',
    './packages/database/src/notification-schema.ts',
    './packages/database/src/webhook-schema.ts',
    './packages/database/src/webhook-delivery-schema.ts',
    './packages/database/src/retention-schema.ts',
    './packages/database/src/purge-schema.ts',
    './packages/database/src/deletion-schema.ts',
  ],
  out: './packages/database/migrations',
});
