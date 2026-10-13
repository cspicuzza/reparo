import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = ReturnType<typeof createDb>['db'];

/**
 * Create a Drizzle client over postgres-js.
 *
 * `prepare: false` because Supabase's pooler runs in transaction mode, which doesn't
 * support prepared statements (Supabase's Drizzle guide:
 * https://supabase.com/docs/guides/database/drizzle). Harmless on a direct connection.
 */
export function createDb(databaseUrl: string, opts: { max?: number } = {}) {
  const client = postgres(databaseUrl, { prepare: false, max: opts.max ?? 10 });
  const db = drizzle({ client, schema });
  return { db, client };
}
