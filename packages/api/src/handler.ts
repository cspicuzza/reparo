import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createDb } from '@reparo/db';
import { FILE_MAX_BYTES, FILE_MIME_TYPES, serverEnv } from '@reparo/shared';
import { createTokenVerifier, supabaseIssuer } from './auth';
import { createContext, type ContextDeps } from './context';
import { appRouter } from './routers';
import { createSupabaseStorage } from './storage/storage';

/** The one private bucket every upload goes in (Q5). */
export const FILES_BUCKET = 'files';

export const TRPC_ENDPOINT = '/api/trpc';

/** Build the dependencies once per process from validated env. */
export function createDeps(env: NodeJS.ProcessEnv = process.env): ContextDeps {
  const cfg = serverEnv(env);
  // On Vercel Fluid compute an instance serves many requests and is suspended between them;
  // Vercel's guidance is a short idle timeout (e.g. 5 s) so unused connections close (OD-149).
  // https://vercel.com/kb/guide/connection-pooling-with-functions
  const { db } = createDb(cfg.DATABASE_URL, { idleTimeout: 5 });
  const verify = createTokenVerifier({
    jwksUrl: cfg.SUPABASE_JWKS_URL,
    issuer: supabaseIssuer(cfg.SUPABASE_URL),
  });
  const storage = createSupabaseStorage({
    url: cfg.SUPABASE_URL,
    secretKey: cfg.SUPABASE_SECRET_KEY,
    bucket: FILES_BUCKET,
    fileSizeLimit: FILE_MAX_BYTES,
    allowedMimeTypes: FILE_MIME_TYPES,
  });
  return { db, verify, storage };
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
