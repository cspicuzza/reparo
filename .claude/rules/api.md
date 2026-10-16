---
paths:
  - "packages/api/**"
  - "apps/web/api/**"
---

# API (packages/api, apps/web/api)

- Routers only parse input, call a service, and return. Services are plain functions `(db, ctx, input)` so they test without tRPC.
- One router per entity, named after the table. Verbs: `list`, `get`, `create`, `update`, `remove` (soft delete), `restore`. A true hard delete needs Chris.
- Input is a Zod schema from `@reparo/shared`. Don't annotate procedure return types; let them infer.
- Errors: `TRPCError` with `NOT_FOUND`, `BAD_REQUEST`, `FORBIDDEN`, `CONFLICT` via helpers in `src/services/errors.ts`. No string error codes.
- Soft-deleted rows are invisible to every read and write (`deleted_at IS NULL` via the service's `live()`); `get` on one is `NOT_FOUND`.
- Every write declares its minimum role (`editorProcedure` / `adminProcedure`).
- Two entry points share one router: `apps/web/api/index.ts` (Vercel, `export default { fetch }`, `/api/trpc/*` rewritten to it) and `src/dev.ts` (local, port `API_PORT`, default 3001). Nothing under `apps/web/api/` uses the `@/` alias — Vercel doesn't support tsconfig paths there; it has its own `tsconfig.api.json`.
- Tests: integration tests against local Postgres, each in a rolled-back transaction. A bug fix comes with the test that would have caught it.
- Files: bytes never pass through the API (Vercel caps a request at 4.5 MB). `files.uploadLink` hands the browser a signed upload link, the browser PUTs to storage, `files.create` records what storage actually holds. Only `src/storage/storage.ts` talks to Supabase Storage; services get it as `ctx.storage`, tests use `createFakeStorage()`. Pictures also get a second link for a small JPEG the browser makes (`thumbPath`); `files.create` records it only if storage holds a JPEG under 1 MB beside the owner's files, and a missing one never fails the upload. File views carry `thumbUrl` (null without one), signed in the same storage call as `url`. Admins backfill older pictures with `files.withoutThumbs`, `thumbLink` and `setThumb` (OD-115).
