import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './packages/database/src/schema.ts',
    './packages/database/src/workspace-schema.ts',
    './packages/database/src/form-schema.ts',
  ],
  out: './packages/database/migrations',
});
