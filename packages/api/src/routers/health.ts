import { memberProcedure, router } from '../trpc';

export const healthRouter = router({
  ping: memberProcedure.query(({ ctx }) => ({
    ok: true as const,
    member: {
      email: ctx.member.email,
      displayName: ctx.member.displayName,
      role: ctx.member.role,
    },
  })),
});
