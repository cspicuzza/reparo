import { initTRPC, TRPCError } from '@trpc/server';
import type { MemberRole } from '@reparo/db';
import type { Context } from './context';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const mergeRouters = t.mergeRouters;

/**
 * Every procedure in Reparo runs behind this guard (CLAUDE.md → Hard rules). There is no
 * public procedure. 401 for no/invalid token, 403 for a Google account that isn't a member.
 */
export const memberProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.member) {
    if (ctx.authError === 'not_a_member') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'This Google account is not on the household list',
      });
    }
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in required' });
  }
  return next({ ctx: { ...ctx, member: ctx.member } });
});

const RANK: Record<MemberRole, number> = { viewer: 0, editor: 1, admin: 2 };

function atLeast(role: MemberRole) {
  return memberProcedure.use(({ ctx, next }) => {
    if (RANK[ctx.member.role] < RANK[role]) {
      throw new TRPCError({ code: 'FORBIDDEN', message: `Requires ${role} role` });
    }
    return next();
  });
}

/** Editor or admin (ADR-008). Every write uses this or `adminProcedure`. */
export const editorProcedure = atLeast('editor');
/** Admin only: members and roles, item list, phases, hard deletes (ADR-008). */
export const adminProcedure = atLeast('admin');
