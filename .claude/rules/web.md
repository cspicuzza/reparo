---
paths:
  - "apps/web/src/**"
---

# Web (apps/web)

- Routes are files under `src/routes` (TanStack Router, file-based). `routeTree.gen.ts` is generated and committed. Route files export only `Route`; screens live in `src/screens/`. `_app.tsx` is the signed-in layout; `sign-in.tsx` is the only public route.
- Put anything shareable in the URL (which room, which filter).
- Server state via TanStack Query through `@trpc/tanstack-react-query` (`useTRPC()` → `useQuery(trpc.x.y.queryOptions())`). One Supabase client (`src/lib/supabase.ts`, PKCE); the tRPC link attaches the access token. Zustand only for UI state that must outlive a route. No Redux, no context-as-store.
- Forms: react-hook-form + the shared Zod schema via `zodResolver` — the same schema the API validates with.
- Derived values (areas, totals, progress) come from the API, not computed in React.
- Tailwind v4 utilities in JSX. Extract a component when the same cluster appears three times. No CSS modules or styled-components.
- **Design system: not decided yet.** Until Chris picks one (tracked in Linear), don't introduce a component library, new tokens, fonts, or a restyle. Use the existing tokens in `src/index.css`.
- Phone and laptop are equal: every screen works at 375px wide and on a laptop. Touch targets at least 44px; nothing depends on a mouse.
- Accessibility: semantic elements, a label on every input, keyboard-reachable actions, visible focus. Colour never carries meaning alone.
- Tests: Vitest, next to the code, for logic-bearing modules.

## Identity

Reparo is a tool for one house, not a generic project manager. Clear enough for someone non-technical: every action is a visible, labelled control (nothing hover-only or shortcut-only). Borrow Linear's feel (speed, calm, list → detail, instant feedback), not its look or power-user patterns. Use household words in the UI, not database terms. Design each screen for what it is: a room, an item across rooms, a phase, the money. The name is the mending charm; nod to it lightly. Chris reviews UI in the browser before it's committed.
