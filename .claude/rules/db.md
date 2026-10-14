---
paths:
  - "packages/db/**"
  - "supabase/**"
---

# Database (packages/db, supabase)

- Every table: `id uuid default gen_random_uuid()`, `created_at`, `updated_at` — use `id()`, `timestamps()`, `softDelete()` from `src/schema/columns.ts`. Attach the `set_updated_at()` trigger in the table's migration.
- Soft delete (`deleted_at`) on anything a person would regret losing: phases, rooms, work items, cost lines, vendors, files. Uniqueness on soft-deletable tables uses partial unique indexes that ignore deleted rows.
- Every new table enables RLS in its migration, with no policies (the browser holds the publishable key; the API bypasses RLS).
- Foreign keys always, with explicit `on delete`. Default `restrict`; `cascade` only for true owned children.
- Enums are `pgEnum`, mirrored by `z.enum` in `@reparo/shared`. Add values by migration; never remove one.
- Migrations: `pnpm db:generate` from the schema; commit the SQL. Hand-written SQL (triggers, RLS, backfills) goes in a custom migration (`drizzle-kit generate --custom --name=…`), never inside a generated one. Never squash or edit an applied migration.
- `supabase/` only runs the local stack. `supabase/migrations` and `supabase/seed.sql` are unused and disabled in `config.toml`.
- Uploads live in Supabase Storage; the `files` row holds bucket, path, mime type, size, owner. Never store bytes in Postgres.
- Drizzle column modes: `numeric(10,4, mode:'number')` for lengths, `bigint(mode:'number')` for cents, `date(mode:'string')` for dates. Connection uses the pooler with `prepare: false`.
