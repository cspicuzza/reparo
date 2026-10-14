import { TRPCError } from '@trpc/server';

/** Postgres unique_violation, surfaced by Drizzle as the `cause` of "Failed query". */
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  const cause = (e as { cause?: unknown } | null)?.cause;
  const pg = cause as { code?: string; constraint_name?: string } | undefined;
  if (pg?.code !== '23505') return false;
  return constraint === undefined || pg.constraint_name === constraint;
}

export function notFound(what: string): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: `${what} not found` });
}

export function conflict(message: string): TRPCError {
  return new TRPCError({ code: 'CONFLICT', message });
}

export function badRequest(message: string): TRPCError {
  return new TRPCError({ code: 'BAD_REQUEST', message });
}
