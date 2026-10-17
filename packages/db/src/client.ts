import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type Schema = typeof schema;
/** A database handle or a transaction on one — services accept either. */
export type Db =
  | PostgresJsDatabase<Schema>
  | PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

/** Error thrown to abort a transaction on purpose (see `withRollback`). */
export class Rollback extends Error {
  constructor() {
    super('rollback');
    this.name = 'Rollback';
  }
}

/**
 * Run `fn` inside a transaction and always roll it back. For tests: every write is undone,
 * so the suite can run against a development database without touching its data.
 */
export async function withRollback<T>(
  db: PostgresJsDatabase<Schema>,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return result as T;
}

/**
 * Create a Drizzle client over postgres-js.
 *
 * `prepare: false` because Supabase's pooler runs in transaction mode, which doesn't
 * support prepared statements (Supabase's Drizzle guide:
 * https://supabase.com/docs/guides/database/drizzle). Harmless on a direct connection.
 *
 * `idleTimeout` (seconds) closes connections nobody is using; postgres.js keeps them forever
 * by default (`idle_timeout: 0`, https://github.com/porsager/postgres/blob/v3.4.9/README.md).
 */
export function createDb(databaseUrl: string, opts: { max?: number; idleTimeout?: number } = {}) {
  const client = postgres(databaseUrl, {
    prepare: false,
    max: opts.max ?? 10,
    idle_timeout: opts.idleTimeout,
  });
  const db = drizzle({ client, schema });
  return { db, client };
}
