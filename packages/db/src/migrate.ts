import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { createDb } from './client';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Apply every pending migration in `packages/db/drizzle`. Used by `pnpm db:migrate` and tests. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const { db, client } = createDb(databaseUrl, { max: 1 });
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await client.end();
  }
}
