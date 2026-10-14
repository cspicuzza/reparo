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
            response = await createFetchHandler({ db: sp, verify })(req);
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

  it('role guards: viewers read, editors write rooms/work, only admins touch phases/items', () =>
    withSeeded(async (_tx, h) => {
      expect((await query(h, 'viewer', 'rooms.list')).status).toBe(200);
      expect((await query(h, 'viewer', 'items.list')).status).toBe(200);
      expect((await query(h, 'viewer', 'phases.list')).status).toBe(200);

      const v = await mutate(h, 'viewer', 'rooms.create', { name: 'Kitchen' });
      expect([v.status, v.code, v.message]).toEqual([403, 'FORBIDDEN', 'Requires editor role']);

      const e1 = await mutate(h, 'editor', 'phases.create', { name: 'Phase 2' });
      expect([e1.status, e1.message]).toEqual([403, 'Requires admin role']);
      const e2 = await mutate(h, 'editor', 'items.create', { name: 'Roofing' });
      expect([e2.status, e2.message]).toEqual([403, 'Requires admin role']);

      expect((await mutate(h, 'editor', 'rooms.create', { name: 'Kitchen' })).status).toBe(200);
      expect((await mutate(h, 'chris', 'phases.create', { name: 'Phase 2' })).status).toBe(200);
      expect((await mutate(h, 'chris', 'items.create', { name: 'Roofing' })).status).toBe(200);
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

  it('items: starter catalog is listed; retire hides from pickers and blocks new work', () =>
    withSeeded(async (_tx, h) => {
      const all = rows(await query(h, 'viewer', 'items.list'));
      expect(all.length).toBeGreaterThanOrEqual(23);
      expect(all[0]?.name).toBe('Demo');
      const stucco = all.find((i) => i.name === 'Stucco');
      const paint = all.find((i) => i.name === 'Paint');
      if (!stucco || !paint) throw new Error('seed missing');

      expect((await mutate(h, 'chris', 'items.create', { name: 'Paint' })).code).toBe('CONFLICT');
      const renamed = await mutate(h, 'chris', 'items.update', {
        id: stucco.id,
        name: 'Stucco repair',
      });
      expect(row(renamed).name).toBe('Stucco repair');

      const retired = await mutate(h, 'chris', 'items.update', { id: stucco.id, retired: true });
      expect(row(retired).retiredAt).not.toBeNull();
      expect(rows(await query(h, 'viewer', 'items.list')).some((i) => i.id === stucco.id)).toBe(
        false,
      );
      expect(
        rows(await query(h, 'viewer', 'items.list', { includeRetired: true })).some(
          (i) => i.id === stucco.id,
        ),
      ).toBe(true);

      const [phase] = rows(await query(h, 'viewer', 'phases.list'));
      if (!phase) throw new Error('seed missing');
      const blocked = await mutate(h, 'editor', 'jobs.create', {
        itemId: stucco.id,
        phaseId: phase.id,
      });
      expect([blocked.status, blocked.code]).toEqual([400, 'BAD_REQUEST']);
      expect(blocked.message).toMatch(/retired/);

      const restored = await mutate(h, 'chris', 'items.update', { id: stucco.id, retired: false });
      expect(row(restored).retiredAt).toBeNull();
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

  it('categories and items: list, Misc by default, admin recategorizes', () =>
    withSeeded(async (_tx, h) => {
      const cats = rows(await query(h, 'viewer', 'categories.list'));
      expect(cats.map((c) => c.name)).toEqual([
        'Remodel',
        'Furnishing',
        'Tech',
        'Appliances',
        'Moving',
        'Misc',
      ]);
      const id = (name: string) => cats.find((c) => c.name === name)?.id;

      const roofing = row(await mutate(h, 'chris', 'items.create', { name: 'Test Roofing' }));
      expect(roofing.categoryId).toBe(id('Misc'));
      const gutters = row(
        await mutate(h, 'chris', 'items.create', {
          name: 'Test Gutters',
          categoryId: id('Remodel'),
        }),
      );
      expect(gutters.categoryId).toBe(id('Remodel'));

      const moved = await mutate(h, 'chris', 'items.update', {
        id: roofing.id,
        categoryId: id('Remodel'),
      });
      expect(row(moved).categoryId).toBe(id('Remodel'));
      const ghost = '99999999-9999-4999-8999-999999999999';
      expect(
        (await mutate(h, 'chris', 'items.update', { id: roofing.id, categoryId: ghost })).code,
      ).toBe('NOT_FOUND');
      expect(
        (await mutate(h, 'editor', 'items.update', { id: roofing.id, categoryId: id('Misc') }))
          .status,
      ).toBe(403);
    }));

  it('jobs: create with rooms, per-room status and spec, roll-up, room and item views', () =>
    withSeeded(async (_tx, h) => {
      const [phase1] = rows(await query(h, 'viewer', 'phases.list'));
      const catalog = rows(await query(h, 'viewer', 'items.list'));
      const paint = catalog.find((i) => i.name === 'Paint');
      const fee = catalog.find((i) => i.name === 'Project Fee');
      if (!phase1 || !paint || !fee) throw new Error('seed missing');
      const room = async (name: string) => row(await mutate(h, 'editor', 'rooms.create', { name }));
      const kitchen = await room('Test Kitchen');
      const den = await room('Test Den');
      const bath = await room('Test Bath');
      const office = await room('Test Office');

      // One action: Paint in Phase 1 covering three rooms; blank name is filled in.
      const created = await mutate(h, 'editor', 'jobs.create', {
        phaseId: phase1.id,
        itemId: paint.id,
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
      type JobRow = Row & { rooms: JobRoomRow[]; progress: Row; phase: Row; item: Row };
      const job = created.data as JobRow;
      expect(job.name).toBe('Paint — Phase 1');
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
          itemId: fee.id,
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
      type ForRoom = Row & { job: Row; item: Row; status: string; resolvedSpec: string };
      const kitchenView = (await query(h, 'viewer', 'jobs.forRoom', { roomId: kitchen.id }))
        .data as ForRoom[];
      expect(kitchenView.map((v) => [v.job.name, v.status])).toEqual([
        ['Paint — Phase 1', 'completed'],
      ]);
      expect(rows(await query(h, 'viewer', 'jobs.forRoom', { roomId: office.id }))).toEqual([]);

      // Item view: the same item can have a job in another phase covering the same room.
      const p2 = row(
        await mutate(h, 'chris', 'phases.create', { name: 'Test Phase 2', sortOrder: 2 }),
      );
      await mutate(h, 'editor', 'jobs.create', {
        phaseId: p2.id,
        itemId: paint.id,
        roomIds: [kitchen.id],
      });
      const paintJobs = (await query(h, 'viewer', 'jobs.list', { itemId: paint.id }))
        .data as JobRow[];
      expect(paintJobs.map((j) => j.name)).toEqual(['Paint — Phase 1', 'Paint — Test Phase 2']);
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
      const catalog = rows(await query(h, 'viewer', 'items.list'));
      const paint = catalog.find((i) => i.name === 'Paint');
      const fee = catalog.find((i) => i.name === 'Project Fee');
      if (!phase1 || !paint || !fee) throw new Error('seed missing');
      const room = async (name: string) => row(await mutate(h, 'editor', 'rooms.create', { name }));
      const den = await room('Home Den');
      const hall = await room('Home Hall');
      await room('Home Loft');

      type JobRow = Row & { rooms: (Row & { room: Row })[] };
      const job = (
        await mutate(h, 'editor', 'jobs.create', {
          phaseId: phase1.id,
          itemId: paint.id,
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
          itemId: fee.id,
          status: 'awaiting_review',
        }),
      );

      type Summary = {
        needsYou: { jobName: string; room: Row | null }[];
        phase: Row | null;
        phaseJobs: (Row & { roomCount: number; progress: Row })[];
        rooms: (Row & { progress: Row; awaitingReview: boolean })[];
      };
      const home = (await query(h, 'viewer', 'home.summary')).data as Summary;

      expect(home.needsYou.map((n) => [n.jobName, n.room?.name ?? null])).toEqual([
        ['Paint — Phase 1', 'Home Den'],
        [feeJob.name, null],
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
    }));

  it('jobs: guards — viewers read only, retired items and unknown rooms are refused', () =>
    withSeeded(async (_tx, h) => {
      const [phase1] = rows(await query(h, 'viewer', 'phases.list'));
      const catalog = rows(await query(h, 'viewer', 'items.list'));
      const trim = catalog.find((i) => i.name === 'Trim');
      const stucco = catalog.find((i) => i.name === 'Stucco');
      if (!phase1 || !trim || !stucco) throw new Error('seed missing');

      const v = await mutate(h, 'viewer', 'jobs.create', { phaseId: phase1.id, itemId: trim.id });
      expect(v.status).toBe(403);

      await mutate(h, 'chris', 'items.update', { id: stucco.id, retired: true });
      const retired = await mutate(h, 'editor', 'jobs.create', {
        phaseId: phase1.id,
        itemId: stucco.id,
      });
      expect([retired.code, retired.message]).toEqual([
        'BAD_REQUEST',
        '"Stucco" is retired; restore it to add work',
      ]);

      const ghost = '99999999-9999-4999-8999-999999999999';
      const noRoom = await mutate(h, 'editor', 'jobs.create', {
        phaseId: phase1.id,
        itemId: trim.id,
        roomIds: [ghost],
      });
      expect(noRoom.code).toBe('NOT_FOUND');
      const withStatus = await mutate(h, 'editor', 'jobs.create', {
        phaseId: phase1.id,
        itemId: trim.id,
        roomIds: [],
        status: 'in_progress',
      });
      expect((withStatus.data as Row & { progress: Row }).progress).toEqual({
        status: 'in_progress',
        done: 0,
        total: 0,
      });
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
