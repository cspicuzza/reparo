import { createDb, eq, members, Rollback, upsertMembers, withRollback, type Db } from '@reparo/db';
import { prepareTestDatabase } from '@reparo/db/testing';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTokenVerifier, supabaseIssuer, type TokenVerifier } from './auth';
import { createContext } from './context';
import { createFetchHandler, TRPC_ENDPOINT } from './handler';
import { rollUp } from './services/jobs';
import { editorProcedure, router } from './trpc';
import { createFakeStorage } from './storage/fake';

// Integration tests: real Postgres (DATABASE_URL), fake Supabase Auth. Tokens are minted with
// a local ES256 key and verified through jose's local JWKS resolver — the same verification
// path as createRemoteJWKSet minus the fetch (https://supabase.com/docs/guides/auth/jwts).
// The tests use their own database, `reparo_test_api`, on the same local server as
// DATABASE_URL, rebuilt and migrated from zero on every run (OD-37); development data is never
// touched. Each test seeds its members inside a transaction that is rolled back.
// Vitest doesn't read .env; load the repo root one like dev.ts does. A DATABASE_URL already in
// the shell wins (observed: loadEnvFile never overrides existing variables).
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL must be set to run @reparo/api tests');
const databaseUrl = await prepareTestDatabase(url, 'api');

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
  /** Stands in for Supabase Storage; `storage.put` plays the browser's upload. */
  const storage = createFakeStorage();
  let getKey: JWTVerifyGetKey;
  let verify: TokenVerifier;
  let sign: (claims: Record<string, unknown>, opts?: SignOpts) => Promise<string>;

  beforeAll(async () => {
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

  /**
   * Seed the test members inside a rolled-back transaction and hand the test a handler on it.
   * Each request runs in its own savepoint, rolled back when the response isn't 2xx: in
   * production every request has its own connection, but here they share one transaction and
   * Postgres refuses everything after an error (e.g. an expected unique violation) until a
   * rollback. The savepoint gives each request the isolation it would have for real.
   */
  function withSeeded(fn: (tx: Db, handler: Handler) => Promise<void>): Promise<void> {
    return withRollback(db, async (tx) => {
      await upsertMembers(tx, MEMBERS);
      const handler: Handler = async (req) => {
        let response: Response | undefined;
        try {
          await tx.transaction(async (sp) => {
            response = await createFetchHandler({ db: sp, verify, storage })(req);
            if (!response.ok) throw new Rollback();
          });
        } catch (e) {
          if (!(e instanceof Rollback)) throw e;
        }
        if (!response) throw new Error('handler produced no response');
        return response;
      };
      await fn(tx, handler);
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

  // --- M1 routers (OD-28) ---------------------------------------------------------------------

  type Who = 'chris' | 'editor' | 'viewer';
  const EMAIL: Record<Who, string> = {
    chris: 'chris@example.com',
    editor: 'editor@example.com',
    viewer: 'viewer@example.com',
  };
  type Rpc = {
    status: number;
    data: unknown;
    code: string | undefined;
    message: string | undefined;
  };

  /** Call one procedure the way the web client does: GET for queries, POST for mutations. */
  async function rpc(
    handler: Handler,
    who: Who,
    path: string,
    input?: unknown,
    method: 'GET' | 'POST' = 'GET',
  ): Promise<Rpc> {
    const token = await sign({ sub: SUB[who], email: EMAIL[who] });
    const headers = new Headers({ authorization: `Bearer ${token}` });
    let url = `http://localhost${TRPC_ENDPOINT}/${path}`;
    let body: string | undefined;
    if (method === 'GET') {
      if (input !== undefined) url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
    } else {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(input ?? null);
    }
    const res = await handler(
      new Request(url, body === undefined ? { method, headers } : { method, headers, body }),
    );
    const json = (await res.json()) as Body;
    return {
      status: res.status,
      data: json.result?.data,
      code: json.error?.data.code,
      message: json.error?.message,
    };
  }
  const query = (h: Handler, who: Who, path: string, input?: unknown) => rpc(h, who, path, input);
  const mutate = (h: Handler, who: Who, path: string, input?: unknown) =>
    rpc(h, who, path, input, 'POST');

  type Row = { id: string; name?: string; [k: string]: unknown };
  const rows = (r: Rpc) => r.data as Row[];
  const row = (r: Rpc) => r.data as Row;

  it('role guards: viewers read, editors write rooms/work/vendors, only admins touch phases or archive vendors', () =>
    withSeeded(async (_tx, h) => {
      expect((await query(h, 'viewer', 'rooms.list')).status).toBe(200);
      expect((await query(h, 'viewer', 'vendors.list')).status).toBe(200);
      expect((await query(h, 'viewer', 'phases.list')).status).toBe(200);

      const v = await mutate(h, 'viewer', 'rooms.create', { name: 'Kitchen' });
      expect([v.status, v.code, v.message]).toEqual([403, 'FORBIDDEN', 'Requires editor role']);

      const e1 = await mutate(h, 'editor', 'phases.create', { name: 'Phase 2' });
      expect([e1.status, e1.message]).toEqual([403, 'Requires admin role']);
      const roofer = await mutate(h, 'editor', 'vendors.create', { name: 'Roofer' });
      expect(roofer.status).toBe(200);
      const e2 = await mutate(h, 'editor', 'vendors.remove', { id: row(roofer).id });
      expect([e2.status, e2.message]).toEqual([403, 'Requires admin role']);
      const v2 = await mutate(h, 'viewer', 'vendors.create', { name: 'Gutters' });
      expect(v2.status).toBe(403);

      expect((await mutate(h, 'editor', 'rooms.create', { name: 'Kitchen' })).status).toBe(200);
      expect((await mutate(h, 'chris', 'phases.create', { name: 'Phase 2' })).status).toBe(200);
      expect((await mutate(h, 'chris', 'vendors.remove', { id: row(roofer).id })).status).toBe(200);
    }));

  it('rooms: create parses lengths, update clears one, duplicates conflict, remove hides', () =>
    withSeeded(async (_tx, h) => {
      const created = await mutate(h, 'editor', 'rooms.create', {
        name: 'Living Room',
        lengthIn: `14' 6 1/16"`,
        widthIn: '87.5',
      });
      expect(created.status).toBe(200);
      const living = row(created);
      expect([living.lengthIn, living.widthIn, living.ceilingHeightIn]).toEqual([
        174.0625,
        87.5,
        null,
      ]);

      const bad = await mutate(h, 'editor', 'rooms.create', { name: 'Nook', lengthIn: 'wide' });
      expect([bad.status, bad.code]).toEqual([400, 'BAD_REQUEST']);

      const dup = await mutate(h, 'editor', 'rooms.create', { name: 'Living Room' });
      expect([dup.status, dup.code]).toEqual([409, 'CONFLICT']);

      const updated = await mutate(h, 'editor', 'rooms.update', { id: living.id, widthIn: '' });
      expect([row(updated).lengthIn, row(updated).widthIn]).toEqual([174.0625, null]);

      expect(rows(await query(h, 'viewer', 'rooms.list')).map((r) => r.name)).toEqual([
        'Living Room',
      ]);
      expect((await mutate(h, 'editor', 'rooms.remove', { id: living.id })).status).toBe(200);
      expect((await query(h, 'viewer', 'rooms.get', { id: living.id })).code).toBe('NOT_FOUND');
      expect(rows(await query(h, 'viewer', 'rooms.list'))).toEqual([]);
      // The name is free again once the old room is soft-deleted.
      expect((await mutate(h, 'editor', 'rooms.create', { name: 'Living Room' })).status).toBe(200);
    }));

  it('phases: Phase 1 is seeded; admin adds, dates are validated, names are unique', () =>
    withSeeded(async (_tx, h) => {
      const seeded = rows(await query(h, 'viewer', 'phases.list'));
      expect(seeded.map((p) => [p.name, p.status])).toEqual([['Phase 1', 'active']]);

      const p2 = await mutate(h, 'chris', 'phases.create', {
        name: 'Phase 2',
        startsOn: '2027-03-01',
      });
      expect([row(p2).status, row(p2).startsOn, row(p2).endsOn]).toEqual([
        'planned',
        '2027-03-01',
        null,
      ]);
      const badDate = await mutate(h, 'chris', 'phases.create', {
        name: 'P3',
        endsOn: '2027-02-30',
      });
      expect(badDate.code).toBe('BAD_REQUEST');
      expect((await mutate(h, 'chris', 'phases.create', { name: 'Phase 1' })).code).toBe(
        'CONFLICT',
      );

      const done = await mutate(h, 'chris', 'phases.update', {
        id: row(p2).id,
        status: 'complete',
      });
      expect(row(done).status).toBe('complete');
      expect((await mutate(h, 'chris', 'phases.remove', { id: row(p2).id })).status).toBe(200);
      expect(rows(await query(h, 'viewer', 'phases.list')).map((p) => p.name)).toEqual(['Phase 1']);
    }));

  // --- M2 (OD-45) -------------------------------------------------------------------------------

  it('vendors: add, search, edit, duplicate names conflict, archive hides but jobs keep them', () =>
    withSeeded(async (_tx, h) => {
      const created = await mutate(h, 'editor', 'vendors.create', {
        name: 'Rolland Reash',
        trade: 'Plumber',
        phone: '555-0101',
      });
      expect(created.status).toBe(200);
      const rr = row(created);
      expect([rr.email, rr.notes]).toEqual(['', '']);
      const tj = row(await mutate(h, 'editor', 'vendors.create', { name: 'TJ', trade: 'Demo' }));

      type VendorRow = Row & { jobCount: number; archived: boolean };
      const list = async (input?: object) =>
        rows(await query(h, 'viewer', 'vendors.list', input)) as VendorRow[];
      expect((await list()).map((v) => v.name)).toEqual(
        expect.arrayContaining(['Rolland Reash', 'TJ']),
      );
      // Search matches the name or what they do, ignoring case; % is literal.
      expect((await list({ query: 'plumb' })).map((v) => v.name)).toEqual(['Rolland Reash']);
      expect((await list({ query: 'rolland' })).map((v) => v.name)).toEqual(['Rolland Reash']);
      expect(await list({ query: '%' })).toEqual([]);

      const dup = await mutate(h, 'editor', 'vendors.create', { name: 'rolland reash' });
      expect([dup.status, dup.message]).toEqual([
        409,
        "There's already a vendor called rolland reash",
      ]);
      const trimmed = await mutate(h, 'editor', 'vendors.update', { id: tj.id, name: ' TJ ' });
      expect(row(trimmed).name).toBe('TJ');
      const clash = await mutate(h, 'editor', 'vendors.update', {
        id: tj.id,
        name: 'Rolland Reash',
      });
      expect(clash.code).toBe('CONFLICT');
      const badEmail = await mutate(h, 'editor', 'vendors.update', { id: tj.id, email: 'nope' });
      expect(badEmail.code).toBe('BAD_REQUEST');

      // A job names TJ; the list counts it.
      const [phase1] = rows(await query(h, 'viewer', 'phases.list'));
      if (!phase1) throw new Error('seed missing');
      const demo = row(
        await mutate(h, 'editor', 'jobs.create', {
          phaseId: phase1.id,
          name: 'Demo week',
          vendorId: tj.id,
        }),
      );
      expect((await list({ query: 'TJ' }))[0]?.jobCount).toBe(1);

      // Archive: gone from the list, the picker and `get`, still on the job.
      await mutate(h, 'chris', 'vendors.remove', { id: tj.id });
      expect((await list()).some((v) => v.id === tj.id)).toBe(false);
      expect((await query(h, 'viewer', 'vendors.get', { id: tj.id })).code).toBe('NOT_FOUND');
      const archived = (await list({ includeArchived: true })).find((v) => v.id === tj.id);
      expect(archived?.archived).toBe(true);
      const onJob = row(await query(h, 'viewer', 'jobs.get', { id: demo.id })) as Row & {
        vendor: Row;
      };
      expect([onJob.vendor.name, onJob.vendor.archived]).toEqual(['TJ', true]);
      // Editing the job leaves the archived vendor alone; picking one needs a live vendor.
      const kept = await mutate(h, 'editor', 'jobs.update', { id: demo.id, notes: 'dumpster' });
      expect((row(kept) as Row & { vendor: Row }).vendor.name).toBe('TJ');
      const pickArchived = await mutate(h, 'editor', 'jobs.update', {
        id: demo.id,
        vendorId: rr.id,
      });
      expect(pickArchived.status).toBe(200);
      const repick = await mutate(h, 'editor', 'jobs.update', { id: demo.id, vendorId: tj.id });
      expect(repick.code).toBe('NOT_FOUND');
      // Clearing the vendor is allowed.
      const cleared = await mutate(h, 'editor', 'jobs.update', { id: demo.id, vendorId: null });
      expect((row(cleared) as Row & { vendor: unknown }).vendor).toBeNull();

      // Restore brings TJ back, unless a live vendor has taken the name meanwhile.
      const newTj = row(await mutate(h, 'editor', 'vendors.create', { name: 'TJ' }));
      expect((await mutate(h, 'chris', 'vendors.restore', { id: tj.id })).code).toBe('CONFLICT');
      await mutate(h, 'chris', 'vendors.remove', { id: newTj.id });
      const back = await mutate(h, 'chris', 'vendors.restore', { id: tj.id });
      expect(row(back).deletedAt).toBeNull();
    }));

  // --- Model fix (OD-34) ------------------------------------------------------------------------

  it('rollUp: cancelled rooms ignored; unstarted / completed / awaiting review / in progress', () => {
    expect(rollUp([], 'in_progress')).toEqual({ status: 'in_progress', done: 0, total: 0 });
    expect(rollUp(['cancelled', 'cancelled'], 'unstarted')).toEqual({
      status: 'cancelled',
      done: 0,
      total: 0,
    });
    expect(rollUp(['unstarted', 'unstarted', 'cancelled'], 'unstarted').status).toBe('unstarted');
    expect(rollUp(['completed', 'completed', 'cancelled'], 'unstarted')).toEqual({
      status: 'completed',
      done: 2,
      total: 2,
    });
    expect(rollUp(['completed', 'awaiting_review'], 'unstarted')).toEqual({
      status: 'awaiting_review',
      done: 1,
      total: 2,
    });
    expect(rollUp(['completed', 'unstarted'], 'unstarted').status).toBe('in_progress');
    expect(rollUp(['awaiting_review', 'unstarted'], 'unstarted').status).toBe('in_progress');
    expect(rollUp(['in_progress'], 'unstarted').status).toBe('in_progress');
  });

  it('jobs: create with rooms, per-room status and spec, roll-up, room and vendor views', () =>
    withSeeded(async (_tx, h) => {
      const [phase1] = rows(await query(h, 'viewer', 'phases.list'));
      if (!phase1) throw new Error('seed missing');
      const proVision = row(
        await mutate(h, 'editor', 'vendors.create', { name: 'Test Pro-vision', trade: 'Painter' }),
      );
      const room = async (name: string) => row(await mutate(h, 'editor', 'rooms.create', { name }));
      const kitchen = await room('Test Kitchen');
      const den = await room('Test Den');
      const bath = await room('Test Bath');
      const office = await room('Test Office');

      // One action: Paint in Phase 1 by Pro-vision, covering three rooms.
      const created = await mutate(h, 'editor', 'jobs.create', {
        phaseId: phase1.id,
        name: 'Paint — Phase 1',
        vendorId: proVision.id,
        spec: 'SW Alabaster, eggshell',
        roomIds: [kitchen.id, den.id, bath.id],
      });
      expect(created.status).toBe(200);
      type JobRoomRow = Row & {
        room: Row;
        status: string;
        resolvedSpec: string;
        specSource: string;
      };
      type JobRow = Row & { rooms: JobRoomRow[]; progress: Row; phase: Row; vendor: Row | null };
      const job = created.data as JobRow;
      expect(job.name).toBe('Paint — Phase 1');
      expect([job.vendor?.name, job.vendor?.trade]).toEqual(['Test Pro-vision', 'Painter']);
      expect(job.rooms.map((r) => r.room.name).sort()).toEqual([
        'Test Bath',
        'Test Den',
        'Test Kitchen',
      ]);
      expect(job.progress).toEqual({ status: 'unstarted', done: 0, total: 3 });
      const jr = (j: JobRow, name: string) => {
        const r = j.rooms.find((x) => x.room.name === name);
        if (!r) throw new Error(`${name} not on job`);
        return r;
      };
      expect([jr(job, 'Test Den').resolvedSpec, jr(job, 'Test Den').specSource]).toEqual([
        'SW Alabaster, eggshell',
        'job',
      ]);

      // The kitchen differs; the den is done, the bath awaits review.
      await mutate(h, 'editor', 'jobRooms.update', {
        id: jr(job, 'Test Kitchen').id,
        spec: 'Accent wall: SW Naval',
        status: 'completed',
      });
      await mutate(h, 'editor', 'jobRooms.update', {
        id: jr(job, 'Test Den').id,
        status: 'completed',
      });
      const afterBath = (
        await mutate(h, 'editor', 'jobRooms.update', {
          id: jr(job, 'Test Bath').id,
          status: 'awaiting_review',
        })
      ).data as JobRow;
      expect(afterBath.progress).toEqual({ status: 'awaiting_review', done: 2, total: 3 });
      // The room page's count: jobs done in that room out of those that count there.
      const roomProgress = async (id: unknown) =>
        (row(await query(h, 'viewer', 'rooms.get', { id })) as Row & { progress: Row }).progress;
      expect(await roomProgress(kitchen.id)).toEqual({ done: 1, total: 1 });
      expect(await roomProgress(bath.id)).toEqual({ done: 0, total: 1 });
      expect(await roomProgress(office.id)).toEqual({ done: 0, total: 0 });
      expect([
        jr(afterBath, 'Test Kitchen').resolvedSpec,
        jr(afterBath, 'Test Kitchen').specSource,
      ]).toEqual(['Accent wall: SW Naval', 'room']);

      // Editing the job's spec flows to every room that says "same as the job".
      const edited = (
        await mutate(h, 'editor', 'jobs.update', { id: job.id, spec: 'SW Alabaster, satin' })
      ).data as JobRow;
      expect(jr(edited, 'Test Den').resolvedSpec).toBe('SW Alabaster, satin');
      expect(jr(edited, 'Test Kitchen').resolvedSpec).toBe('Accent wall: SW Naval');
      // A blank room spec goes back to "same as the job".
      const reset = (
        await mutate(h, 'editor', 'jobRooms.update', { id: jr(job, 'Test Kitchen').id, spec: '' })
      ).data as JobRow;
      expect(jr(reset, 'Test Kitchen').specSource).toBe('job');

      // Status by hand is refused while the job covers rooms…
      const refused = await mutate(h, 'editor', 'jobs.update', {
        id: job.id,
        status: 'completed',
      });
      expect([refused.status, refused.code]).toEqual([400, 'BAD_REQUEST']);
      // …but a job with no rooms (a fee) has its own status.
      const feeJob = row(
        await mutate(h, 'editor', 'jobs.create', {
          phaseId: phase1.id,
          name: "Brian's project fee",
        }),
      );
      const paid = await mutate(h, 'editor', 'jobs.update', { id: feeJob.id, status: 'completed' });
      expect((paid.data as JobRow).progress).toEqual({ status: 'completed', done: 0, total: 0 });

      // Rooms: a duplicate conflicts; removed and added back works; a removed room vanishes.
      const dup = await mutate(h, 'editor', 'jobRooms.create', {
        jobId: job.id,
        roomId: den.id,
      });
      expect([dup.status, dup.code]).toEqual([409, 'CONFLICT']);
      await mutate(h, 'editor', 'jobRooms.remove', { id: jr(job, 'Test Den').id });
      const back = (await mutate(h, 'editor', 'jobRooms.create', { jobId: job.id, roomId: den.id }))
        .data as JobRow;
      expect(jr(back, 'Test Den').status).toBe('unstarted');
      await mutate(h, 'editor', 'rooms.remove', { id: bath.id });
      const noBath = row(await query(h, 'viewer', 'jobs.get', { id: job.id })) as JobRow;
      expect(noBath.rooms.some((r) => r.room.name === 'Test Bath')).toBe(false);

      // Room view: only the jobs that cover the room. The office has none.
      type ForRoom = Row & { job: Row; vendor: Row | null; status: string; resolvedSpec: string };
      const kitchenView = (await query(h, 'viewer', 'jobs.forRoom', { roomId: kitchen.id }))
        .data as ForRoom[];
      expect(kitchenView.map((v) => [v.job.name, v.status, v.vendor?.name])).toEqual([
        ['Paint — Phase 1', 'completed', 'Test Pro-vision'],
      ]);
      expect(rows(await query(h, 'viewer', 'jobs.forRoom', { roomId: office.id }))).toEqual([]);

      // Vendor view: the same vendor can have a job in another phase covering the same room;
      // jobs come back in phase order.
      const p2 = row(
        await mutate(h, 'chris', 'phases.create', { name: 'Test Phase 2', sortOrder: 2 }),
      );
      await mutate(h, 'editor', 'jobs.create', {
        phaseId: p2.id,
        name: 'Exterior paint',
        vendorId: proVision.id,
        roomIds: [kitchen.id],
      });
      const theirJobs = (await query(h, 'viewer', 'jobs.list', { vendorId: proVision.id }))
        .data as JobRow[];
      expect(theirJobs.map((j) => [j.name, j.phase.name])).toEqual([
        ['Paint — Phase 1', 'Phase 1'],
        ['Exterior paint', 'Test Phase 2'],
      ]);
      const inP2 = (await query(h, 'viewer', 'jobs.list', { phaseId: p2.id })).data as JobRow[];
      expect(inP2.map((j) => j.name)).toEqual(['Exterior paint']);
      expect(
        ((await query(h, 'viewer', 'jobs.forRoom', { roomId: kitchen.id })).data as ForRoom[])
          .length,
      ).toBe(2);

      // Remove hides the job everywhere; restore brings it back with its rooms.
      await mutate(h, 'editor', 'jobs.remove', { id: job.id });
      expect((await query(h, 'viewer', 'jobs.get', { id: job.id })).code).toBe('NOT_FOUND');
      expect(
        ((await query(h, 'viewer', 'jobs.forRoom', { roomId: kitchen.id })).data as ForRoom[])
          .length,
      ).toBe(1);
      const kitchenWhileRemoved = await roomProgress(kitchen.id);
      const restored = (await mutate(h, 'editor', 'jobs.restore', { id: job.id })).data as JobRow;
      expect(restored.rooms.length).toBe(2);
      // A removed job doesn't count in a room's progress; a Cancelled room doesn't either.
      // (The kitchen is Completed on this job and also covered by one other job.)
      const kitchenBack = await roomProgress(kitchen.id);
      expect(kitchenBack).toEqual({
        done: Number(kitchenWhileRemoved.done) + 1,
        total: Number(kitchenWhileRemoved.total) + 1,
      });
      await mutate(h, 'editor', 'jobRooms.update', {
        id: jr(restored, 'Test Kitchen').id,
        status: 'cancelled',
      });
      expect(await roomProgress(kitchen.id)).toEqual(kitchenWhileRemoved);
    }));

  it('home: needs you, the current phase and room progress', () =>
    withSeeded(async (_tx, h) => {
      const [phase1] = rows(await query(h, 'viewer', 'phases.list'));
      if (!phase1) throw new Error('seed missing');
      const room = async (name: string) => row(await mutate(h, 'editor', 'rooms.create', { name }));
      const den = await room('Home Den');
      const hall = await room('Home Hall');
      await room('Home Loft');

      type JobRow = Row & { rooms: (Row & { room: Row })[] };
      const job = (
        await mutate(h, 'editor', 'jobs.create', {
          phaseId: phase1.id,
          name: 'Paint — Phase 1',
          roomIds: [den.id, hall.id],
        })
      ).data as JobRow;
      const jr = (name: string) => job.rooms.find((r) => r.room.name === name);
      await mutate(h, 'editor', 'jobRooms.update', {
        id: jr('Home Den')?.id,
        status: 'awaiting_review',
      });
      await mutate(h, 'editor', 'jobRooms.update', {
        id: jr('Home Hall')?.id,
        status: 'completed',
      });
      // A job with no rooms (a fee) waits as a whole.
      const feeJob = row(
        await mutate(h, 'editor', 'jobs.create', {
          phaseId: phase1.id,
          name: 'Project fee',
          status: 'awaiting_review',
        }),
      );

      type Summary = {
        needsYou: { jobId: string; jobName: string; room: Row | null }[];
        phase: Row | null;
        phaseJobs: (Row & { roomCount: number; progress: Row })[];
        rooms: (Row & { progress: Row; awaitingReview: boolean })[];
      };
      const home = (await query(h, 'viewer', 'home.summary')).data as Summary;

      expect(home.needsYou.map((n) => [n.jobId, n.jobName, n.room?.name ?? null])).toEqual([
        [job.id, 'Paint — Phase 1', 'Home Den'],
        [feeJob.id, feeJob.name, null],
      ]);
      expect([home.phase?.name, home.phase?.status]).toEqual(['Phase 1', 'active']);
      const paintJob = home.phaseJobs.find((j) => j.id === job.id);
      expect([paintJob?.roomCount, paintJob?.progress]).toEqual([
        2,
        { status: 'awaiting_review', done: 1, total: 2 },
      ]);
      const tile = (name: string) => home.rooms.find((r) => r.name === name);
      expect([tile('Home Den')?.progress, tile('Home Den')?.awaitingReview]).toEqual([
        { done: 0, total: 1 },
        true,
      ]);
      expect([tile('Home Hall')?.progress, tile('Home Hall')?.awaitingReview]).toEqual([
        { done: 1, total: 1 },
        false,
      ]);
      expect([tile('Home Loft')?.progress, tile('Home Loft')?.awaitingReview]).toEqual([
        { done: 0, total: 0 },
        false,
      ]);

      // The lists carry the same counts: rooms by job, phases by rolled-up job status.
      type WithProgress = Row & { progress: Row };
      const listed = rows(await query(h, 'viewer', 'rooms.list')) as WithProgress[];
      expect(listed.find((r) => r.name === 'Home Hall')?.progress).toEqual({ done: 1, total: 1 });
      const phaseRows = rows(await query(h, 'viewer', 'phases.list')) as WithProgress[];
      // Paint awaits review in the den; the fee awaits review: none done, both counted.
      expect(phaseRows.find((p) => p.id === phase1.id)?.progress).toEqual({ done: 0, total: 2 });
      await mutate(h, 'editor', 'jobs.update', { id: feeJob.id, status: 'completed' });
      const after = rows(await query(h, 'viewer', 'phases.list')) as WithProgress[];
      expect(after.find((p) => p.id === phase1.id)?.progress).toEqual({ done: 1, total: 2 });
    }));

  it('jobs: guards — viewers read only; a name, a real phase, vendor and rooms are needed', () =>
    withSeeded(async (_tx, h) => {
      const [phase1] = rows(await query(h, 'viewer', 'phases.list'));
      if (!phase1) throw new Error('seed missing');

      const v = await mutate(h, 'viewer', 'jobs.create', { phaseId: phase1.id, name: 'Trim' });
      expect(v.status).toBe(403);
      const noName = await mutate(h, 'editor', 'jobs.create', { phaseId: phase1.id, name: ' ' });
      expect([noName.code, noName.message]).toEqual(['BAD_REQUEST', expect.stringMatching(/name/)]);

      const ghost = '99999999-9999-4999-8999-999999999999';
      const noVendor = await mutate(h, 'editor', 'jobs.create', {
        phaseId: phase1.id,
        name: 'Trim',
        vendorId: ghost,
      });
      expect([noVendor.code, noVendor.message]).toEqual(['NOT_FOUND', 'Vendor not found']);
      const noRoom = await mutate(h, 'editor', 'jobs.create', {
        phaseId: phase1.id,
        name: 'Trim',
        roomIds: [ghost],
      });
      expect(noRoom.code).toBe('NOT_FOUND');
      const withStatus = await mutate(h, 'editor', 'jobs.create', {
        phaseId: phase1.id,
        name: 'Trim',
        roomIds: [],
        status: 'in_progress',
      });
      expect((withStatus.data as Row & { progress: Row }).progress).toEqual({
        status: 'in_progress',
        done: 0,
        total: 0,
      });
    }));

  // --- M3 (OD-50) -------------------------------------------------------------------------------

  /** Phase 1 (active, seeded), a category by name, and a fresh planned phase. */
  async function moneyFixtures(h: Handler) {
    const [phase1] = rows(await query(h, 'viewer', 'phases.list'));
    const cats = rows(await query(h, 'viewer', 'categories.list'));
    const cat = (name: string) => {
      const c = cats.find((x) => x.name === name);
      if (!c) throw new Error(`no category ${name}`);
      return c.id;
    };
    if (!phase1) throw new Error('seed missing');
    const phase2 = row(
      await mutate(h, 'chris', 'phases.create', { name: 'Money Phase 2', sortOrder: 50 }),
    );
    return { phase1, phase2, cat };
  }

  it('money role guards: editors keep lines, costs and payments; only the admin touches the pool and categories', () =>
    withSeeded(async (_tx, h) => {
      const { phase1, cat } = await moneyFixtures(h);
      expect((await query(h, 'viewer', 'money.summary')).status).toBe(200);
      expect((await query(h, 'viewer', 'budget.get')).status).toBe(200);
      const v = await mutate(h, 'viewer', 'shoppingLines.create', {
        phaseId: phase1.id,
        categoryId: cat('Rugs'),
        name: 'Rug',
      });
      expect(v.status).toBe(403);
      const e = await mutate(h, 'editor', 'shoppingLines.create', {
        phaseId: phase1.id,
        categoryId: cat('Rugs'),
        name: 'Rug',
      });
      expect(e.status).toBe(200);
      for (const [path, input] of [
        ['budget.update', { startingCents: '300,000' }],
        ['budgetAdjustments.create', { amountCents: '-5,000', on: '2026-09-15' }],
        ['categories.create', { name: 'Garden' }],
        ['categories.update', { id: cat('Rugs'), name: 'Carpets' }],
        ['categories.merge', { id: cat('Rugs'), intoId: cat('Decor') }],
      ] as const) {
        const r = await mutate(h, 'editor', path, input);
        expect([path, r.status]).toEqual([path, 403]);
      }
      const job = row(
        await mutate(h, 'editor', 'jobs.create', { phaseId: phase1.id, name: 'Trim' }),
      );
      expect(
        (
          await mutate(h, 'editor', 'costLines.create', {
            jobId: job.id,
            description: 'Quote',
            amountCents: '20,000',
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await mutate(h, 'editor', 'payments.create', {
            jobId: job.id,
            amountCents: '5,000',
            paidOn: '2026-10-01',
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await mutate(h, 'viewer', 'payments.create', {
            jobId: job.id,
            amountCents: '1',
            paidOn: '2026-10-01',
          })
        ).status,
      ).toBe(403);
    }));

  it('shopping lines: add, buy, return, back to To buy; amounts and phases are checked', () =>
    withSeeded(async (_tx, h) => {
      const { phase1, phase2, cat } = await moneyFixtures(h);
      const living = row(await mutate(h, 'editor', 'rooms.create', { name: 'Shop Living' }));
      type LineRow = Row & {
        status: string;
        priceCents: number;
        paidCents: number | null;
        refundCents: number | null;
        room: Row | null;
        category: Row;
        job: Row | null;
      };
      const created = await mutate(h, 'editor', 'shoppingLines.create', {
        phaseId: phase1.id,
        categoryId: cat('Furniture'),
        roomId: living.id,
        name: 'Couch',
        store: 'Castlery',
        priceCents: '5,000',
      });
      expect(created.status).toBe(200);
      const couch = created.data as LineRow;
      expect([couch.status, couch.priceCents, couch.room?.name, couch.category.name]).toEqual([
        'to_buy',
        500000,
        'Shop Living',
        'Furniture',
      ]);

      // Purchased needs what was paid; it can differ from the price.
      expect(
        (await mutate(h, 'editor', 'shoppingLines.update', { id: couch.id, status: 'purchased' }))
          .code,
      ).toBe('BAD_REQUEST');
      const bought = (
        await mutate(h, 'editor', 'shoppingLines.update', {
          id: couch.id,
          status: 'purchased',
          paidCents: '4,800',
        })
      ).data as LineRow;
      expect([bought.status, bought.paidCents, bought.refundCents]).toEqual([
        'purchased',
        480000,
        null,
      ]);

      // Returned: no more than was paid came back.
      const tooMuch = await mutate(h, 'editor', 'shoppingLines.update', {
        id: couch.id,
        status: 'returned',
        refundCents: '5,000',
      });
      expect([tooMuch.code, tooMuch.message]).toEqual([
        'BAD_REQUEST',
        'More came back than was paid; check the amounts',
      ]);
      const back = (
        await mutate(h, 'editor', 'shoppingLines.update', {
          id: couch.id,
          status: 'returned',
          refundCents: '4,500',
        })
      ).data as LineRow;
      expect([back.status, back.paidCents, back.refundCents]).toEqual(['returned', 480000, 450000]);
      // Back to To buy clears both amounts.
      const again = (
        await mutate(h, 'editor', 'shoppingLines.update', { id: couch.id, status: 'to_buy' })
      ).data as LineRow;
      expect([again.paidCents, again.refundCents]).toEqual([null, null]);

      // A To-buy line can't jump straight to Returned.
      const jump = await mutate(h, 'editor', 'shoppingLines.update', {
        id: couch.id,
        status: 'returned',
        refundCents: '1',
      });
      expect(jump.message).toBe('Mark it as purchased first, with what was paid');

      // "For this job": the job must be in the same phase.
      const flooring = row(
        await mutate(h, 'editor', 'jobs.create', { phaseId: phase2.id, name: 'Flooring' }),
      );
      const wrongPhase = await mutate(h, 'editor', 'shoppingLines.create', {
        phaseId: phase1.id,
        categoryId: cat('Other'),
        jobId: flooring.id,
        name: 'Tile',
      });
      expect([wrongPhase.code, wrongPhase.message]).toEqual([
        'BAD_REQUEST',
        '"Flooring" is in another phase; put this line in the same phase',
      ]);
      const tile = (
        await mutate(h, 'editor', 'shoppingLines.create', {
          phaseId: phase2.id,
          categoryId: cat('Other'),
          jobId: flooring.id,
          name: 'Tile',
          priceCents: 0,
        })
      ).data as LineRow;
      expect(tile.job?.name).toBe('Flooring');

      // Lists: To buy first; whole-house lines by roomId null; by job.
      const all = rows(await query(h, 'viewer', 'shoppingLines.list')) as LineRow[];
      expect(all.map((l) => l.name)).toEqual(expect.arrayContaining(['Couch', 'Tile']));
      const house = rows(
        await query(h, 'viewer', 'shoppingLines.list', { roomId: null }),
      ) as LineRow[];
      expect(house.map((l) => l.name)).toEqual(['Tile']);
      const forJob = rows(
        await query(h, 'viewer', 'shoppingLines.list', { jobId: flooring.id }),
      ) as LineRow[];
      expect(forJob.map((l) => l.name)).toEqual(['Tile']);

      // Remove hides it; restore brings it back.
      await mutate(h, 'editor', 'shoppingLines.remove', { id: tile.id });
      expect((await query(h, 'viewer', 'shoppingLines.get', { id: tile.id })).code).toBe(
        'NOT_FOUND',
      );
      expect((await mutate(h, 'editor', 'shoppingLines.restore', { id: tile.id })).status).toBe(
        200,
      );
    }));

  it('categories: add, duplicate names conflict, rename, merge moves the lines', () =>
    withSeeded(async (_tx, h) => {
      const { phase1, cat } = await moneyFixtures(h);
      const garden = row(await mutate(h, 'chris', 'categories.create', { name: 'Garden' }));
      const list = async () => rows(await query(h, 'viewer', 'categories.list'));
      expect((await list()).at(-1)?.name).toBe('Garden');
      expect((await mutate(h, 'chris', 'categories.create', { name: 'rugs' })).code).toBe(
        'CONFLICT',
      );
      expect(
        row(
          await mutate(h, 'chris', 'categories.update', { id: garden.id, name: 'Garden & patio' }),
        ).name,
      ).toBe('Garden & patio');

      const pots = row(
        await mutate(h, 'editor', 'shoppingLines.create', {
          phaseId: phase1.id,
          categoryId: garden.id,
          name: 'Pots',
        }),
      );
      const merged = await mutate(h, 'chris', 'categories.merge', {
        id: garden.id,
        intoId: cat('Decor'),
      });
      expect((merged.data as { moved: number }).moved).toBe(1);
      expect((await list()).some((c) => c.id === garden.id)).toBe(false);
      const moved = row(await query(h, 'viewer', 'shoppingLines.get', { id: pots.id })) as Row & {
        category: Row;
      };
      expect(moved.category.name).toBe('Decor');
      // The merged category's name is free again.
      expect(
        (await mutate(h, 'chris', 'categories.create', { name: 'Garden & patio' })).status,
      ).toBe(200);
      expect(
        (await mutate(h, 'chris', 'categories.merge', { id: cat('Decor'), intoId: cat('Decor') }))
          .code,
      ).toBe('BAD_REQUEST');
    }));

  it('job money: cost lines and payments give a payment status', () =>
    withSeeded(async (_tx, h) => {
      const { phase1 } = await moneyFixtures(h);
      const paint = row(
        await mutate(h, 'editor', 'jobs.create', { phaseId: phase1.id, name: 'Paint' }),
      );
      type Money = {
        costCents: number;
        paidCents: number;
        payment: { kind: string; percent?: number };
      };
      const money = async () =>
        (row(await query(h, 'viewer', 'jobs.get', { id: paint.id })) as Row & { money: Money })
          .money;
      expect(await money()).toEqual({
        costCents: 0,
        paidCents: 0,
        owedCents: 0,
        payment: { kind: 'no_price' },
      });

      const quote = row(
        await mutate(h, 'editor', 'costLines.create', {
          jobId: paint.id,
          description: 'Pro-vision quote',
          amountCents: '35,000',
        }),
      );
      const permit = row(
        await mutate(h, 'editor', 'costLines.create', {
          jobId: paint.id,
          description: 'Permit',
          amountCents: '250',
        }),
      );
      expect((await money()).payment).toEqual({ kind: 'unpaid' });
      const deposit = row(
        await mutate(h, 'editor', 'payments.create', {
          jobId: paint.id,
          amountCents: '10,000',
          paidOn: '2026-10-01',
          note: 'Deposit',
        }),
      );
      expect(await money()).toEqual({
        costCents: 3525000,
        paidCents: 1000000,
        owedCents: 2525000,
        payment: { kind: 'deposit', percent: 28 },
      });
      const lines = rows(await query(h, 'viewer', 'costLines.list', { jobId: paint.id }));
      expect(lines.map((l) => l.description)).toEqual(['Pro-vision quote', 'Permit']);

      // Edit and remove; then the rest is paid.
      await mutate(h, 'editor', 'costLines.update', { id: quote.id, amountCents: '34,000' });
      await mutate(h, 'editor', 'costLines.remove', { id: permit.id });
      await mutate(h, 'editor', 'payments.update', { id: deposit.id, amountCents: '14,000' });
      await mutate(h, 'editor', 'payments.create', {
        jobId: paint.id,
        amountCents: '20,000',
        paidOn: '2026-11-01',
      });
      expect(await money()).toEqual({
        costCents: 3400000,
        paidCents: 3400000,
        owedCents: 0,
        payment: { kind: 'paid' },
      });
      expect(rows(await query(h, 'viewer', 'payments.list', { jobId: paint.id })).length).toBe(2);
      const bad = await mutate(h, 'editor', 'payments.create', {
        jobId: paint.id,
        amountCents: '12.345',
        paidOn: '2026-11-01',
      });
      expect([bad.code, bad.message]).toEqual([
        'BAD_REQUEST',
        expect.stringContaining('Enter an amount like 1,234.56'),
      ]);
    }));

  it('money summary: pool, Spent, Committed, Available and the totals, as Home shows them', () =>
    withSeeded(async (_tx, h) => {
      const { phase1, phase2, cat } = await moneyFixtures(h);
      type Summary = {
        pool: { startingCents: number; adjustmentsCents: number; poolCents: number };
        spentCents: number;
        committedCents: number;
        availableCents: number;
        byPhase: {
          id: string;
          counting: boolean;
          spentCents: number;
          toComeCents: number;
          leavesCents: number | null;
        }[];
        byCategory: { name: string; spentCents: number; committedCents: number }[];
        byRoom: { id: string | null; name: string; spentCents: number; committedCents: number }[];
      };
      const summary = async () => (await query(h, 'viewer', 'money.summary')).data as Summary;
      const before = await summary();

      await mutate(h, 'chris', 'budget.update', { startingCents: '300,000', asOf: '2026-09-03' });
      const adj = await mutate(h, 'chris', 'budgetAdjustments.create', {
        amountCents: '-5,000',
        on: '2026-09-15',
        note: '401K loan',
      });
      expect((adj.data as { poolCents: number }).poolCents).toBe(29500000);

      // Phase 1: a $35,000 job with a $10,000 deposit, a rug bought for $850, a $5,000 couch to buy.
      const paint = row(
        await mutate(h, 'editor', 'jobs.create', { phaseId: phase1.id, name: 'Paint' }),
      );
      await mutate(h, 'editor', 'costLines.create', {
        jobId: paint.id,
        description: 'Quote',
        amountCents: '35,000',
      });
      await mutate(h, 'editor', 'payments.create', {
        jobId: paint.id,
        amountCents: '10,000',
        paidOn: '2026-10-01',
      });
      const rug = row(
        await mutate(h, 'editor', 'shoppingLines.create', {
          phaseId: phase1.id,
          categoryId: cat('Rugs'),
          name: 'Rug',
          priceCents: '900',
        }),
      );
      await mutate(h, 'editor', 'shoppingLines.update', {
        id: rug.id,
        status: 'purchased',
        paidCents: '850',
      });
      await mutate(h, 'editor', 'shoppingLines.create', {
        phaseId: phase1.id,
        categoryId: cat('Furniture'),
        name: 'Couch',
        priceCents: '5,000',
      });
      // Phase 2 (planned): a $15,000 bath job; not committed, but Phase 2 would need it.
      const bath = row(
        await mutate(h, 'editor', 'jobs.create', { phaseId: phase2.id, name: 'Guest bath' }),
      );
      await mutate(h, 'editor', 'costLines.create', {
        jobId: bath.id,
        description: 'Estimate',
        amountCents: '15,000',
      });

      const s = await summary();
      expect(s.pool).toMatchObject({
        startingCents: 30000000,
        adjustmentsCents: -500000,
        poolCents: 29500000,
      });
      expect(s.spentCents - before.spentCents).toBe(1000000 + 85000);
      expect(s.committedCents - before.committedCents).toBe(2500000 + 500000);
      expect(s.availableCents).toBe(29500000 - s.spentCents - s.committedCents);
      const p2 = s.byPhase.find((p) => p.id === phase2.id);
      expect(p2).toMatchObject({
        counting: false,
        toComeCents: 1500000,
        leavesCents: s.availableCents - 1500000,
      });
      expect(s.byCategory.find((c) => c.name === 'Rugs')).toMatchObject({
        spentCents: 85000,
        committedCents: 0,
      });
      expect(s.byRoom.at(-1)).toMatchObject({ id: null, name: 'Whole house' });

      // Cancelling the job: its deposit stays spent; the rest is no longer committed.
      await mutate(h, 'editor', 'jobs.update', { id: paint.id, status: 'cancelled' });
      const c = await summary();
      expect(c.spentCents).toBe(s.spentCents);
      expect(s.committedCents - c.committedCents).toBe(2500000);

      // Home carries the same headline.
      type Home = {
        money: { availableCents: number; plannedPhases: { id: string; leavesCents: number }[] };
      };
      const home = (await query(h, 'viewer', 'home.summary')).data as Home;
      expect(home.money.availableCents).toBe(c.availableCents);
      expect(home.money.plannedPhases.find((p) => p.id === phase2.id)?.leavesCents).toBe(
        c.availableCents - 1500000,
      );
    }));

  // --- M4 files (OD-55) -----------------------------------------------------------------------

  type FileRow = {
    id: string;
    kind: string;
    caption: string;
    takenOn: string | null;
    jobId: string | null;
    jobName: string | null;
    sizeBytes: number;
    mimeType: string;
    isCover: boolean;
    isPicture: boolean;
    url: string | null;
  };

  /** The web's three steps: ask for a link, PUT the bytes (here: storage.put), record it. */
  async function upload(
    h: Handler,
    who: Who,
    input: Record<string, unknown>,
    arrived?: { sizeBytes: number; mimeType: string },
  ) {
    const start = await mutate(h, who, 'files.uploadLink', input);
    if (start.status !== 200) return start;
    const { path } = start.data as { path: string; uploadUrl: string };
    const sent = input as { sizeBytes: number; mimeType: string };
    storage.put(path, arrived?.sizeBytes ?? sent.sizeBytes, arrived?.mimeType ?? sent.mimeType);
    return mutate(h, who, 'files.create', { ...input, path });
  }

  it('files: viewers look, editors upload; type, size and kind are checked', () =>
    withSeeded(async (_tx, h) => {
      const kitchen = row(await mutate(h, 'editor', 'rooms.create', { name: 'Kitchen' }));
      const pic = {
        ownerType: 'room',
        ownerId: kitchen.id,
        kind: 'rendering',
        originalName: 'final.png',
        mimeType: 'image/png',
        sizeBytes: 4_000_000,
      };

      const v = await mutate(h, 'viewer', 'files.uploadLink', pic);
      expect([v.status, v.message]).toEqual([403, 'Requires editor role']);

      const heic = await mutate(h, 'editor', 'files.uploadLink', {
        ...pic,
        mimeType: 'image/heic',
      });
      expect([heic.status, heic.message]).toEqual([400, 'Pictures need to be JPEG, PNG or WebP']);
      const pdfRendering = await mutate(h, 'editor', 'files.uploadLink', {
        ...pic,
        mimeType: 'application/pdf',
      });
      expect(pdfRendering.status).toBe(400);
      const big = await mutate(h, 'editor', 'files.uploadLink', {
        ...pic,
        sizeBytes: 50 * 1024 * 1024 + 1,
      });
      expect([big.status, big.message]).toEqual([400, 'That file is over 50 MB']);
      const wrongKind = await mutate(h, 'editor', 'files.uploadLink', { ...pic, kind: 'receipt' });
      expect([wrongKind.status, wrongKind.message]).toEqual([
        400,
        "A room can't hold that kind of file",
      ]);
      const nowhere = await mutate(h, 'editor', 'files.uploadLink', {
        ...pic,
        ownerId: '00000000-0000-4000-8000-000000000000',
      });
      expect(nowhere.status).toBe(404);

      const made = await upload(h, 'editor', { ...pic, caption: 'Option B' });
      expect(made.status).toBe(200);
      const file = made.data as FileRow;
      expect(file).toMatchObject({ kind: 'rendering', caption: 'Option B', isPicture: true });
      expect(file.url).toMatch(/^fake:\/\/files\/room\/.*\.png\?expires=3600$/);

      const list = await query(h, 'viewer', 'files.list', {
        ownerType: 'room',
        ownerId: kitchen.id,
      });
      expect(list.status).toBe(200);
      expect((list.data as FileRow[]).map((f) => f.id)).toEqual([file.id]);
    }));

  it('files: what storage holds wins; a missing upload or a borrowed path is refused', () =>
    withSeeded(async (_tx, h) => {
      const kitchen = row(await mutate(h, 'editor', 'rooms.create', { name: 'Kitchen' }));
      const den = row(await mutate(h, 'editor', 'rooms.create', { name: 'Den' }));
      const base = {
        ownerType: 'room',
        ownerId: kitchen.id,
        kind: 'inspiration',
        originalName: 'idea.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
      };

      // Storage says it's really a PDF: refused, whatever the browser claimed.
      const lied = await upload(h, 'editor', base, {
        sizeBytes: 1000,
        mimeType: 'application/pdf',
      });
      expect([lied.status, lied.message]).toEqual([400, 'Pictures need to be JPEG, PNG or WebP']);

      // Size is taken from storage.
      const sized = await upload(h, 'editor', base, { sizeBytes: 2345, mimeType: 'image/jpeg' });
      expect((sized.data as FileRow).sizeBytes).toBe(2345);

      // Never uploaded.
      const start = await mutate(h, 'editor', 'files.uploadLink', base);
      const { path } = start.data as { path: string };
      const missing = await mutate(h, 'editor', 'files.create', { ...base, path });
      expect([missing.status, missing.message]).toEqual([
        400,
        'The file didn’t arrive. Try again.',
      ]);

      // A path made for the kitchen can't be recorded on the den, or twice.
      storage.put(path, 1000, 'image/jpeg');
      const borrowed = await mutate(h, 'editor', 'files.create', {
        ...base,
        ownerId: den.id,
        path,
      });
      expect([borrowed.status, borrowed.message]).toEqual([400, 'That upload doesn’t belong here']);
      expect((await mutate(h, 'editor', 'files.create', { ...base, path })).status).toBe(200);
      expect((await mutate(h, 'editor', 'files.create', { ...base, path })).status).toBe(409);
    }));

  it('files: progress photos carry a date and a job that covers the room; captions change', () =>
    withSeeded(async (_tx, h) => {
      const phase = rows(await query(h, 'viewer', 'phases.list'))[0];
      const bath = row(await mutate(h, 'editor', 'rooms.create', { name: 'Bath' }));
      const den = row(await mutate(h, 'editor', 'rooms.create', { name: 'Den' }));
      if (!phase) throw new Error('no phase');
      const tile = row(
        await mutate(h, 'editor', 'jobs.create', {
          phaseId: phase.id,
          name: 'Tile',
          roomIds: [bath.id],
        }),
      );
      const paint = row(
        await mutate(h, 'editor', 'jobs.create', {
          phaseId: phase.id,
          name: 'Paint',
          roomIds: [den.id],
        }),
      );
      const photo = {
        ownerType: 'room',
        ownerId: bath.id,
        kind: 'progress_photo',
        originalName: 'IMG_1.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 3_000_000,
      };

      const notCovering = await upload(h, 'editor', { ...photo, jobId: paint.id });
      expect([notCovering.status, notCovering.message]).toEqual([
        400,
        'That job doesn’t cover this room',
      ]);
      const made = await upload(h, 'editor', { ...photo, jobId: tile.id, takenOn: '2026-10-12' });
      expect(made.data).toMatchObject({ takenOn: '2026-10-12', jobId: tile.id });
      const undated = await upload(h, 'editor', photo);
      expect((undated.data as FileRow).takenOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const id = (made.data as FileRow).id;
      const list = async () =>
        (await query(h, 'viewer', 'files.list', { ownerType: 'room', ownerId: bath.id }))
          .data as FileRow[];
      expect((await list()).find((f) => f.id === id)?.jobName).toBe('Tile');

      const changed = await mutate(h, 'editor', 'files.update', {
        id,
        caption: 'Tile going in',
        takenOn: '2026-10-13',
        jobId: null,
      });
      expect(changed.data).toMatchObject({
        caption: 'Tile going in',
        takenOn: '2026-10-13',
        jobId: null,
      });

      const rendering = await upload(h, 'editor', { ...photo, kind: 'rendering' });
      const dated = await mutate(h, 'editor', 'files.update', {
        id: (rendering.data as FileRow).id,
        takenOn: '2026-10-13',
      });
      expect([dated.status, dated.message]).toEqual([
        400,
        'Only progress photos have a date and a job',
      ]);
    }));

  it('files: a room cover is one of its renderings; removing it clears the cover', () =>
    withSeeded(async (_tx, h) => {
      const kitchen = row(await mutate(h, 'editor', 'rooms.create', { name: 'Kitchen' }));
      const den = row(await mutate(h, 'editor', 'rooms.create', { name: 'Den' }));
      const base = {
        ownerType: 'room',
        ownerId: kitchen.id,
        originalName: 'a.webp',
        mimeType: 'image/webp',
        sizeBytes: 10,
      };
      const first = (await upload(h, 'editor', { ...base, kind: 'rendering' })).data as FileRow;
      const second = (await upload(h, 'editor', { ...base, kind: 'rendering' })).data as FileRow;
      const idea = (await upload(h, 'editor', { ...base, kind: 'inspiration' })).data as FileRow;
      const denPic = (await upload(h, 'editor', { ...base, ownerId: den.id, kind: 'rendering' }))
        .data as FileRow;

      const list = async () =>
        (await query(h, 'viewer', 'files.list', { ownerType: 'room', ownerId: kitchen.id }))
          .data as FileRow[];
      // All three; newest first is by upload time, which is one instant inside this test's
      // transaction, so only the set is checked here.
      expect((await list()).map((f) => f.id).sort()).toEqual([idea.id, second.id, first.id].sort());

      const bad1 = await mutate(h, 'editor', 'rooms.setCover', {
        roomId: kitchen.id,
        fileId: idea.id,
      });
      const bad2 = await mutate(h, 'editor', 'rooms.setCover', {
        roomId: kitchen.id,
        fileId: denPic.id,
      });
      expect([bad1.status, bad2.status]).toEqual([400, 400]);
      const v = await mutate(h, 'viewer', 'rooms.setCover', {
        roomId: kitchen.id,
        fileId: first.id,
      });
      expect(v.status).toBe(403);

      await mutate(h, 'editor', 'rooms.setCover', { roomId: kitchen.id, fileId: first.id });
      const covered = await list();
      expect(covered[0]).toMatchObject({ id: first.id, isCover: true });

      expect((await mutate(h, 'viewer', 'files.remove', { id: first.id })).status).toBe(403);
      expect((await mutate(h, 'editor', 'files.remove', { id: first.id })).status).toBe(200);
      const after = await list();
      expect(after.map((f) => f.id).sort()).toEqual([idea.id, second.id].sort());
      expect(after.every((f) => !f.isCover)).toBe(true);
      expect((await mutate(h, 'editor', 'files.remove', { id: first.id })).status).toBe(404);
    }));

  it('files: every M4 owner takes its own kinds; PDFs where a document makes sense', () =>
    withSeeded(async (_tx, h) => {
      const phase = rows(await query(h, 'viewer', 'phases.list'))[0];
      const cat = rows(await query(h, 'viewer', 'categories.list'))[0];
      if (!phase || !cat) throw new Error('fixtures missing');
      const job = row(
        await mutate(h, 'editor', 'jobs.create', { phaseId: phase.id, name: 'Demo' }),
      );
      const vendor = row(await mutate(h, 'editor', 'vendors.create', { name: 'TJ' }));
      const pay = row(
        await mutate(h, 'editor', 'payments.create', {
          jobId: job.id,
          amountCents: '100',
          paidOn: '2026-10-01',
        }),
      );
      const line = row(
        await mutate(h, 'editor', 'shoppingLines.create', {
          phaseId: phase.id,
          categoryId: cat.id,
          name: 'Rug',
          priceCents: '100',
        }),
      );
      const pdf = { originalName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 5 };
      const ok = [
        { ownerType: 'job', ownerId: job.id, kind: 'paperwork' },
        { ownerType: 'job', ownerId: job.id, kind: 'spec_drawing' },
        { ownerType: 'payment', ownerId: pay.id, kind: 'receipt' },
        { ownerType: 'shopping_line', ownerId: line.id, kind: 'receipt' },
        { ownerType: 'vendor', ownerId: vendor.id, kind: 'vendor_document' },
      ];
      for (const o of ok) expect((await upload(h, 'editor', { ...o, ...pdf })).status).toBe(200);

      const productPdf = await upload(h, 'editor', {
        ownerType: 'shopping_line',
        ownerId: line.id,
        kind: 'product_image',
        ...pdf,
      });
      expect(productPdf.status).toBe(400);
      const quoteEarly = await mutate(h, 'editor', 'files.uploadLink', {
        ownerType: 'estimate',
        ownerId: job.id,
        kind: 'quote',
        ...pdf,
      });
      expect(quoteEarly.status).toBe(400);
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
          createContext: ({ req }) => createContext({ db: tx, verify, storage }, req),
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
