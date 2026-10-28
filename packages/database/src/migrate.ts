import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { openDatabase } from './client.ts';

if (!process.env.DATABASE_MIGRATION_URL)
  throw new Error('Configure the ignored migration environment first.');
const { db, close } = await openDatabase(process.env.DATABASE_MIGRATION_URL);
try {
  await migrate(db, { migrationsFolder: './migrations' });
  console.log('Reviewed database migrations applied.');
} finally {
  await close();
}
