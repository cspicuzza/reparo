import { memberProcedure, router } from '../trpc';

export const healthRouter = router({
  ping: memberProcedure.query(({ ctx }) => ({
    ok: true as const,
    member: {
      email: ctx.member.email,
      displayName: ctx.member.displayName,
      role: ctx.member.role,
    },
    /** The stored role, so the app can always offer "Back to admin" while previewing (OD-133). */
    realRole: ctx.realRole ?? ctx.member.role,
  })),
});
