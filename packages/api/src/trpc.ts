import { initTRPC, TRPCError, type TRPCDefaultErrorShape } from '@trpc/server';
import { ZodError } from 'zod';
import type { MemberRole } from '@reparo/db';
import { appEnvSchema } from '@reparo/shared';
import type { Context } from './context';

/** What the browser gets for an unexpected server error outside local development (OD-168). */
export const INTERNAL_MESSAGE = 'Something went wrong on the server. Try again.';

/**
 * Raw error text and stack traces show only on this machine (`APP_ENV=local`, OD-168). Read on
 * every error, not once at import: dev.ts and the tests load .env after their imports run. A
 * missing or unknown APP_ENV counts as hosted, so the text stays hidden.
 */
export function showsRawErrors(env: NodeJS.ProcessEnv = process.env): boolean {
  const parsed = appEnvSchema.safeParse(env['APP_ENV']);
  return parsed.success && parsed.data === 'local';
}

/**
 * - Input that fails its schema reads as the schema's own words ("Enter a name"), not the raw
 *   list of issues as JSON (OD-125, Q164). The issues stay in `data.issues`.
 * - Outside local development (OD-168): no stack, and an unexpected error (a failed query
 *   carries its SQL and values) reads as INTERNAL_MESSAGE. NOT_FOUND, CONFLICT, FORBIDDEN and
 *   the like keep their own messages. tRPC's formatter: https://trpc.io/docs/server/error-formatting
 */
export function formatError(
  { shape, error }: { shape: TRPCDefaultErrorShape; error: TRPCError },
  raw: boolean,
) {
  const data = { ...shape.data };
  if (!raw) delete data.stack;
  if (error.code === 'BAD_REQUEST' && error.cause instanceof ZodError) {
    const words = [...new Set(error.cause.issues.map((i) => i.message))].join('. ');
    return { ...shape, message: words, data: { ...data, issues: error.cause.issues } };
  }
  if (error.code === 'INTERNAL_SERVER_ERROR' && !raw) {
    return { ...shape, message: INTERNAL_MESSAGE, data };
  }
  return { ...shape, data };
}

// isDev only decides whether tRPC puts a stack in the shape; formatError takes it out again
// unless APP_ENV is local (https://trpc.io/docs/server/error-handling).
const t = initTRPC.context<Context>().create({
  isDev: true,
  errorFormatter: (opts) => formatError(opts, showsRawErrors()),
});

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
/** Admin only: members and roles, phases, archiving vendors, hard deletes (ADR-008). */
export const adminProcedure = atLeast('admin');
