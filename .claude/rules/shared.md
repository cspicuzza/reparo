---
paths:
  - "packages/shared/**"
---

# Shared (packages/shared)

- This is the only place units are implemented. It depends on no other workspace package.
- Every helper has tests, including rounding, negative and zero cents, and fractional-inch edge cases (1/16" snapping, reduced fractions).
- Zod schemas: `RoomSchema`, `CreateRoomInput`, `UpdateRoomInput` naming. Export the inferred types.
- `env.ts` validates every variable in `.env.example`: `webEnv()` (`VITE_*`) and `serverEnv()`. Missing vars fail at startup, all listed at once. A new env var goes in `.env.example` with a comment and in the schema in the same change.
