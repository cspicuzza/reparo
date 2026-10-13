# Reparo

Home-renovation management app for a household acting as its own general contractor. One renovation, up to four signed-in people. It centralizes the budget, room measurements and specifications, vendors, materials, costs, task status and progress, and renderings of the intended final design for each space.

## Research & answering rules

1. Accuracy comes first. Everything must be grounded in verifiable
   information. Never guess, fabricate details, or fill gaps just to provide
   an answer. If something cannot be verified, say so clearly.

2. Research in proportion to the stakes. Do not rely on surface-level
   information when additional research could materially improve accuracy or
   completeness — but match the depth of research to the importance of the
   question. If web search or document fetching is available, use it for
   version-specific, product-specific, or time-sensitive questions rather
   than answering from training memory.

3. Prioritize primary sources. For technology, products, specifications,
   compatibility, and technical questions, use official documentation as the
   primary source. Verify the documentation applies to the exact product,
   model, software version, or generation in use. In code, this means linking
   the doc page for the API or library version you relied on.

4. Separate fact from inference. When an answer rests on facts that could be
   wrong or on a judgment call, label them:
   - Verified: directly supported by reliable evidence or documentation.
   - Inferred: a reasonable conclusion from verified information, not
     explicitly confirmed.
   - Assumed: not verified; used only as a working assumption.
   Do not label the obvious or the trivial.

5. Cite your sources. Provide direct links supporting important factual
   claims. Prefer primary over secondary sources when both are available.

6. Check recency. Note the date of any figure that can go stale (prices,
   versions, availability, schedules). Prefer the docs version that matches
   the version actually in use.

7. When sources conflict, observed behavior wins. If official docs disagree
   with what the code, tests, or a live system actually do, go with the
   observed behavior and flag the discrepancy.

8. Handle ambiguity and missing information. If an interpretation or
   assumption would not materially change the answer, state it and proceed.
   If it would, ask before proceeding. Never make a material assumption
   silently.

9. Stay within scope. Answer the question asked. In code, do not refactor,
   rename, reformat, or "improve" anything outside the task unless it is
   necessary or specifically requested. Do not branch into unrelated
   research, recommendations, or side quests.

10. Do not simply agree. If a premise appears incorrect, incomplete, or
    contradicted by the evidence, say so. Point out meaningful risks,
    tradeoffs, flaws, or alternatives, even when they conflict with the
    stated position.

11. Be transparent about uncertainty. Never present uncertain, outdated,
    conflicting, or incomplete information as established fact. Explain the
    limitation and, when possible, what would resolve it.

## Workflow expectations

- Do not add dependencies without asking.
- Do not commit or push unless told to.
- Run the relevant tests and linters before declaring work done (once they
  exist).
- Keep changes small and reviewable; one concern per change.

## Where truth lives

| What | Where |
|---|---|
| What we're building (and not) | `docs/scope.md` |
| Why we chose things | `docs/decisions.md` — dated ADRs, append-only |
| How we write code | `docs/conventions.md` |
| Entities and relationships | `docs/data-model.md` |
| Roadmap, milestones, done-criteria, tasks | Linear project **Reparo** (P-OD-4), team **OD** — https://linear.app/okayishdev/project/reparo-ffa182a4db1c. Milestone descriptions hold the done-criteria. |

Linear issues reference these docs; they don't duplicate them. If code and docs disagree, the docs win until an ADR says otherwise. If a change alters behavior a doc describes, update the doc in the same commit series.

## Stack (ADR-001, ADR-002)

- **Web:** React 19 SPA on Vite, TypeScript strict, Tailwind, TanStack Router + Query, Zustand for the little client state that isn't server state.
- **API:** Node + tRPC + Zod. One Vercel function, `apps/web/api/index.ts` (`export default { fetch }`), with `/api/trpc/*` rewritten to it (ADR-012). No `@/` alias inside `api/`.
- **Data:** Postgres on Supabase, Drizzle ORM + migrations. Supabase Storage for renderings, receipts, quotes.
- **Auth:** Google SSO via Supabase Auth; API only admits emails present in `members`, with roles admin / editor / viewer (ADR-008).
- **Repo:** pnpm monorepo. `apps/web`, `packages/api`, `packages/db`, `packages/shared`.
- **Hosting:** local only — Supabase CLI (`supabase start`) + Vite — until Chris says deploy (ADR-010). Target when he does: Vercel (web + API), Supabase (DB, auth, storage). Keep code Vercel-shaped.

## Commands

`pnpm install`, `pnpm dev`, `pnpm check`, `pnpm build` work as of OD-24; `supabase start`, `db:generate`, `db:migrate` as of OD-22; `db:seed` and the API dev server as of OD-21; Google sign-in and the signed-in shell as of OD-20. Copy `.env.example` to `.env` first; `supabase start` prints the local keys. Vite reads `VITE_*` from `.env` itself.

```
pnpm install          # once
supabase start        # local Postgres + Auth + Storage (Docker)
pnpm dev              # Vite on :5173 + API on :3001 (tsx watch); Vite proxies /api
pnpm check            # typecheck + lint + format + test — run before every commit
pnpm db:generate      # Drizzle migration from schema change (packages/db/drizzle)
pnpm db:migrate       # apply migrations to DATABASE_URL (local Supabase: port 54322)
pnpm db:seed          # upsert members from MEMBERS in .env
pnpm db:studio        # Drizzle Studio over DATABASE_URL
```

`@reparo/db` and `@reparo/api` tests are integration tests: they need a running Postgres (local Supabase) and read `DATABASE_URL` from the root `.env`, so `pnpm check` works once `supabase start` is up. A `DATABASE_URL` set in the shell takes precedence. They are non-destructive: migrations are applied only if pending and every test's writes are rolled back.

## Workflow for agents

1. Start from a Linear issue. Work on `develop` — no feature branches or PRs unless Chris asks. Put `OD-<n>` in every commit message so Linear links the commit to the issue.
2. Read this file, the relevant `docs/` pages, and the issue before writing code. Don't re-derive decisions that are already in `docs/decisions.md`. If you can't reach Linear from your session, say so and ask Chris for the issue text — don't guess the scope.
3. One issue at a time; small commits, one concern each. Conventional-commit messages (`feat(web): room list (OD-30)`). Commit locally; don't push unless Chris says.
4. `pnpm check` must pass before a commit. There is no CI; the local check is the gate.
5. Behavior change → doc change in the same commit series. Choice from the "needs an ADR" list → ADR alongside it.
6. When done, move the Linear issue and leave a comment: what changed, what's left, anything surprising.

## Hard rules

- TypeScript `strict`. No `any`, no `@ts-ignore`/`@ts-expect-error` without a one-line reason.
- Validate every boundary with Zod: tRPC inputs, environment variables, file uploads, imported data.
- **Money is integer cents** (`bigint` in Postgres, `number` in TS, never floats). **Lengths are stored in inches** as `numeric(10,4)`, snapped to 1/16" (ADR-011), and displayed as ft/in. Helpers live in `packages/shared`; don't reimplement them.
- Every table has `id uuid`, `created_at`, `updated_at`. Soft-delete (`deleted_at`) on anything a person would regret deleting: phases, rooms, work items, cost lines, vendors, files.
- Schema changes only through Drizzle migrations committed to the repo. Never alter the database by hand, locally or hosted.
- No anonymous routes. Every tRPC procedure runs behind the member guard.
- Secrets live only in `.env` (gitignored) and the Vercel/Supabase dashboards. `.env.example` lists every variable with a comment.
- Don't add a dependency for something the stack already does. A new runtime dependency needs Chris's OK first and a sentence of justification in the commit body.
- Don't write code that isn't on the roadmap. If an issue needs something out of scope, say so in the issue instead of building it.

## Needs an ADR before doing

- A new top-level app or package
- A new external service or paid tier
- Any change to the auth model or roles
- Any change to how money, lengths, or dates are represented
- Anything that changes a Linear milestone's done-criteria

## Ask Chris before

- Deleting data, dropping tables, or rewriting a migration that has been applied anywhere
- Spending money (paid tiers, domains, services)
- Reordering the roadmap
- Force-pushing or rewriting `develop` or `main`

## Do not touch `raw/`

`raw/` holds Chris's source material (the current budget spreadsheet and anything else he drops there). It is gitignored. Read from it; never modify, move, rename, or delete anything in it, and never commit it.
