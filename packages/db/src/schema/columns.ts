import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

/** `id uuid primary key default gen_random_uuid()` — every table. */
export const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);

/**
 * `created_at` / `updated_at` — every table. `updated_at` is maintained by the
 * `set_updated_at()` trigger (see the first migration), not by application code.
 */
export const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/** Soft-delete marker. Rows with a value are hidden from normal reads. */
export const softDelete = () => ({
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
});
