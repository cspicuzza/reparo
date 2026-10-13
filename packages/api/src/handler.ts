import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createDb } from '@reparo/db';
import { serverEnv } from '@reparo/shared';
import { createTokenVerifier, supabaseIssuer } from './auth';
import { createContext, type ContextDeps } from './context';
import { appRouter } from './routers';

export const TRPC_ENDPOINT = '/api/trpc';

/** Build the dependencies once per process from validated env. */
export function createDeps(env: NodeJS.ProcessEnv = process.env): ContextDeps {
  const cfg = serverEnv(env);
  const { db } = createDb(cfg.DATABASE_URL);
  const verify = createTokenVerifier({
    jwksUrl: cfg.SUPABASE_JWKS_URL,
    issuer: supabaseIssuer(cfg.SUPABASE_URL),
  });
  return { db, verify };
}

/**
 * Web-standard handler (Request → Response). Used verbatim by the Vercel function
 * (https://trpc.io/docs/server/adapters/fetch) and by tests.
 */
export function createFetchHandler(deps: ContextDeps) {
  return (req: Request): Promise<Response> =>
    fetchRequestHandler({
      endpoint: TRPC_ENDPOINT,
      req,
      router: appRouter,
      createContext: ({ req }) => createContext(deps, req),
    });
}
