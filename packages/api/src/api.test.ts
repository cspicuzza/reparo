import {
  createDb,
  eq,
  members,
  runMigrations,
  upsertMembers,
  withRollback,
  type Db,
} from '@reparo/db';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTokenVerifier, supabaseIssuer, type TokenVerifier } from './auth';
import { createContext } from './context';
import { createFetchHandler, TRPC_ENDPOINT } from './handler';
import { editorProcedure, router } from './trpc';

// Integration tests: real Postgres (DATABASE_URL), fake Supabase Auth. Tokens are minted with
// a local ES256 key and verified through jose's local JWKS resolver — the same verification
// path as createRemoteJWKSet minus the fetch (https://supabase.com/docs/guides/auth/jwts).
// Non-destructive: each test seeds its members inside a transaction that is rolled back, so a
// development database is left exactly as it was.
// Vitest doesn't read .env; load the repo root one like dev.ts does. A DATABASE_URL already in
// the shell wins (observed: loadEnvFile never overrides existing variables).
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL must be set to run @reparo/api tests');
const databaseUrl: string = url;

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ISSUER = supabaseIssuer(SUPABASE_URL);
const MEMBERS = 'chris@example.com:admin,editor@example.com:editor,viewer@example.com:viewer';
const SUB = {
  chris: '11111111-1111-4111-8111-111111111111',
  viewer: '22222222-2222-4222-8222-222222222222',
  stranger: '33333333-3333-4333-8333-333333333333',
  editor: '44444444-4444-4444-8444-444444444444',
};

type SignOpts = { issuer?: string; kid?: string };
type Handler = (req: Request) => Promise<Response>;
type Body = { result?: { data: unknown }; error?: { message: string; data: { code: string } } };

describe('@reparo/api', () => {
  const { db, client } = createDb(databaseUrl, { max: 2 });
  let getKey: JWTVerifyGetKey;
  let verify: TokenVerifier;
  let sign: (claims: Record<string, unknown>, opts?: SignOpts) => Promise<string>;

  beforeAll(async () => {
    await runMigrations(databaseUrl); // idempotent: applies only what's pending

    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };
    getKey = createLocalJWKSet({ keys: [jwk] });
    sign = (claims, opts = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'ES256', kid: opts.kid ?? 'test-key' })
        .setIssuer(opts.issuer ?? ISSUER)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);

    verify = createTokenVerifier({
      jwksUrl: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
      issuer: ISSUER,
      getKey,
    });
  });

  afterAll(async () => {
    await client.end();
  });

  /** Seed the test members inside a rolled-back transaction and hand the test a handler on it. */
  function withSeeded(fn: (tx: Db, handler: Handler) => Promise<void>): Promise<void> {
    return withRollback(db, async (tx) => {
      await upsertMembers(tx, MEMBERS);
      await fn(tx, createFetchHandler({ db: tx, verify }));
    });
  }

  function ping(handler: Handler, token?: string): Promise<Response> {
    const headers = new Headers();
    if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
    return handler(new Request(`http://localhost${TRPC_ENDPOINT}/health.ping`, { headers }));
  }

  const body = (res: Response): Promise<Body> => res.json() as Promise<Body>;

  it('returns the member for a valid token and records supabase_user_id', () =>
    withSeeded(async (tx, handler) => {
      const token = await sign({
        sub: SUB.chris,
        email: 'chris@example.com',
        role: 'authenticated',
      });
      const res = await ping(handler, token);
      expect(res.status).toBe(200);
      expect((await body(res)).result?.data).toEqual({
        ok: true,
        member: { email: 'chris@example.com', displayName: 'chris', role: 'admin' },
      });
      const [row] = await tx.select().from(members).where(eq(members.email, 'chris@example.com'));
      expect(row?.supabaseUserId).toBe(SUB.chris);
    }));

  it('401 with no token', () =>
    withSeeded(async (_tx, handler) => {
      const res = await ping(handler);
      expect(res.status).toBe(401);
      expect((await body(res)).error?.data.code).toBe('UNAUTHORIZED');
    }));

  it('401 with a garbage token, a wrong issuer, or an unknown key', () =>
    withSeeded(async (_tx, handler) => {
      const claims = { sub: SUB.chris, email: 'chris@example.com' };
      expect((await ping(handler, 'not.a.jwt')).status).toBe(401);
      const wrongIssuer = await sign(claims, { issuer: 'https://evil.example/auth/v1' });
      expect((await ping(handler, wrongIssuer)).status).toBe(401);
      expect((await ping(handler, await sign(claims, { kid: 'other-key' }))).status).toBe(401);
    }));

  it('401 for a token missing the claims we need', () =>
    withSeeded(async (_tx, handler) => {
      expect((await ping(handler, await sign({ sub: SUB.chris }))).status).toBe(401);
      const badSub = await sign({ sub: 'not-a-uuid', email: 'chris@example.com' });
      expect((await ping(handler, badSub)).status).toBe(401);
    }));

  it('403 for a valid token whose email is not a member', () =>
    withSeeded(async (_tx, handler) => {
      const token = await sign({ sub: SUB.stranger, email: 'stranger@example.com' });
      const res = await ping(handler, token);
      expect(res.status).toBe(403);
      expect((await body(res)).error?.message).toMatch(/not on the household list/);
    }));

  it('403 when a viewer calls an editor-only procedure; editor passes', () =>
    withSeeded(async (tx) => {
      const testRouter = router({ write: editorProcedure.mutation(() => 'ok') });
      const call = async (email: string, sub: string) => {
        const req = new Request(`http://localhost${TRPC_ENDPOINT}/write`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${await sign({ sub, email })}`,
            'content-type': 'application/json',
          },
          body: 'null',
        });
        return fetchRequestHandler({
          endpoint: TRPC_ENDPOINT,
          req,
          router: testRouter,
          createContext: ({ req }) => createContext({ db: tx, verify }, req),
        });
      };
      const viewer = await call('viewer@example.com', SUB.viewer);
      expect(viewer.status).toBe(403);
      expect((await body(viewer)).error?.message).toMatch(/Requires editor role/);

      const editor = await call('editor@example.com', SUB.editor);
      expect(editor.status).toBe(200);
      expect((await body(editor)).result?.data).toBe('ok');
    }));
});
