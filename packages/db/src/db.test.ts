import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb, withRollback, type Db } from './client';
import { FILE_KINDS, FILE_OWNER_TYPES, WORK_STATUSES } from '@reparo/shared';
import {
  categories,
  fileKind,
  fileOwnerType,
  files,
  jobRooms,
  jobs,
  members,
  phases,
  rooms,
  vendors,
  workStatus,
} from './schema';
import { prepareTestDatabase } from './testing';
import { parseMembers, upsertMembers } from './seed';

// Integration tests against a real Postgres: their own database, `reparo_test_db`, on the same
// local server as DATABASE_URL (Supabase on 54322), rebuilt and migrated from zero on every run
// (OD-37). Development data is never read or written. Every test's writes still happen inside a
// transaction that is rolled back, so tests don't see each other's rows.
// Vitest doesn't read .env; load the repo root one like dev.ts does. A DATABASE_URL already in
// the shell wins (observed: loadEnvFile never overrides existing variables).
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL must be set to run @reparo/db tests');
const databaseUrl = await prepareTestDatabase(url, 'db');

/** Drizzle wraps driver errors as "Failed query: …" and keeps the Postgres error in `cause`. */
async function expectDbError(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  let caught: unknown;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(Error);
  const err = caught as Error & { cause?: unknown };
  const cause = err.cause instanceof Error ? err.cause.message : '';
  expect(`${err.message}\n${cause}`).toMatch(pattern);
}

/**
 * Expect a statement to fail without aborting the surrounding transaction: Postgres refuses
 * every statement after an error until rollback, so the failing one runs inside a savepoint
 * (Drizzle's nested `transaction()`).
 */
function expectDbErrorIn(tx: Db, pattern: RegExp, fn: (sp: Db) => Promise<unknown>): Promise<void> {
  return expectDbError(
    tx.transaction((sp) => fn(sp)),
    pattern,
  );
}

const MEMBERS = 'chris@example.com:admin,Editor@Example.com:editor,viewer@example.com:viewer';

describe('@reparo/db', () => {
  const { db, client } = createDb(databaseUrl, { max: 2 });

  afterAll(async () => {
    await client.end();
  });

  it('has both migrations applied', async () => {
    const rows = await client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
    expect(rows[0]?.n).toBeGreaterThanOrEqual(8);
  });

  it('test databases: refuses a non-local host before touching it', async () => {
    await expect(
      prepareTestDatabase('postgresql://postgres:x@db.example.supabase.co:5432/postgres', 'db'),
    ).rejects.toThrow(/Refusing to run tests against db\.example\.supabase\.co/);
    await expect(prepareTestDatabase(databaseUrl, 'Bad-Name')).rejects.toThrow(/Bad test suite/);
    expect(new URL(databaseUrl).pathname).toBe('/reparo_test_db');
  });

  it('parseMembers validates and lowercases', () => {
    expect(parseMembers(MEMBERS)).toEqual([
      { email: 'chris@example.com', role: 'admin', displayName: 'chris' },
      { email: 'editor@example.com', role: 'editor', displayName: 'editor' },
      { email: 'viewer@example.com', role: 'viewer', displayName: 'viewer' },
    ]);
    expect(() => parseMembers('')).toThrow(/MEMBERS is empty/);
    expect(() => parseMembers('nope:admin')).toThrow(/must be email:role/);
    expect(() => parseMembers('a@b.co:owner')).toThrow(/must be email:role/);
  });

  it('seeds members idempotently (re-seed updates role, keeps display name)', () =>
    withRollback(db, async (tx) => {
      expect(await upsertMembers(tx, MEMBERS)).toBe(3);
      await tx
        .update(members)
        .set({ displayName: 'Chris Spicuzza' })
        .where(eq(members.email, 'chris@example.com'));
      expect(await upsertMembers(tx, 'chris@example.com:admin,viewer@example.com:editor')).toBe(2);

      const seeded = await tx
        .select()
        .from(members)
        .where(eq(members.email, 'chris@example.com'))
        .union(tx.select().from(members).where(eq(members.email, 'editor@example.com')))
        .union(tx.select().from(members).where(eq(members.email, 'viewer@example.com')))
        .orderBy(members.email);
      expect(seeded.map((m) => [m.email, m.role, m.displayName])).toEqual([
        ['chris@example.com', 'admin', 'Chris Spicuzza'],
        ['editor@example.com', 'editor', 'editor'],
        ['viewer@example.com', 'editor', 'viewer'],
      ]);
    }));

  it('rejects an uppercase email at the database', () =>
    withRollback(db, (tx) =>
      expectDbError(
        tx.insert(members).values({ email: 'Upper@example.com', displayName: 'x' }),
        /members_email_lowercase/,
      ),
    ));

  it('rejects an unknown role at the database', () =>
    withRollback(db, (tx) =>
      expectDbError(
        tx.execute(
          `INSERT INTO members (email, display_name, role) VALUES ('r@example.com','r','owner')`,
        ),
        /invalid input value for enum member_role/,
      ),
    ));

  it('set_updated_at trigger bumps updated_at on update', () =>
    withRollback(db, async (tx) => {
      // Inside a transaction now() is frozen at its start, so insert with timestamps in the past.
      const past = new Date(Date.now() - 60_000);
      const [row] = await tx
        .insert(members)
        .values({
          email: 'trigger@example.com',
          displayName: 't',
          createdAt: past,
          updatedAt: past,
        })
        .returning();
      if (!row) throw new Error('insert failed');
      await tx.update(members).set({ displayName: 'T' }).where(eq(members.id, row.id));
      const [after] = await tx.select().from(members).where(eq(members.id, row.id));
      expect(after?.updatedAt.getTime()).toBeGreaterThan(past.getTime());
      expect(after?.createdAt.getTime()).toBe(past.getTime());
    }));

  it('files reference a member; a bad uploader is rejected', async () => {
    await withRollback(db, async (tx) => {
      const [m] = await tx
        .insert(members)
        .values({ email: 'uploader@example.com', displayName: 'u' })
        .returning();
      if (!m) throw new Error('insert failed');
      const [row] = await tx
        .insert(files)
        .values({
          kind: 'mockup',
          bucket: 'mockups',
          path: 'kitchen/1.png',
          mimeType: 'image/png',
          sizeBytes: 12345,
          originalName: '1.png',
          ownerType: 'job',
          ownerId: m.id, // any uuid; owner tables arrive in M1
          uploadedBy: m.id,
        })
        .returning();
      expect(row?.deletedAt).toBeNull();
      expect(row?.sortOrder).toBe(0);
    });
    await withRollback(db, (tx) =>
      expectDbError(
        tx.insert(files).values({
          kind: 'receipt',
          bucket: 'receipts',
          path: 'x',
          mimeType: 'image/png',
          sizeBytes: 1,
          originalName: 'x',
          ownerType: 'cost',
          ownerId: '00000000-0000-0000-0000-000000000000',
          uploadedBy: '00000000-0000-0000-0000-000000000000',
        }),
        /files_uploaded_by_members_id_fk/,
      ),
    );
  });

  // --- M1 (OD-27) ---

  it('seeds Phase 1', async () => {
    const [phase] = await db.select().from(phases).where(eq(phases.name, 'Phase 1'));
    expect(phase?.status).toBe('active');
    expect(phase?.deletedAt).toBeNull();
  });

  it('rejects an unknown work status', () =>
    withRollback(db, async (tx) => {
      const [phase] = await tx.select().from(phases).where(eq(phases.name, 'Phase 1'));
      if (!phase) throw new Error('seed missing');
      await expectDbError(
        tx.execute(`INSERT INTO jobs (phase_id, name, status) VALUES ('${phase.id}','x','done')`),
        /invalid input value for enum work_status/,
      );
    }));

  it('stores room measurements as numeric(10,4) and reads them back as numbers', () =>
    withRollback(db, async (tx) => {
      const [room] = await tx
        .insert(rooms)
        .values({ name: 'Living Room', lengthIn: 174.0625, widthIn: 87.5 })
        .returning();
      expect(room?.lengthIn).toBe(174.0625); // 14' 6 1/16" — exact at four decimals (ADR-011)
      expect(room?.widthIn).toBe(87.5);
      expect(room?.ceilingHeightIn).toBeNull();
      expect(typeof room?.lengthIn).toBe('number');
    }));

  it('live room and phase names are unique; soft-delete frees the name', () =>
    withRollback(db, async (tx) => {
      const [foyer] = await tx.insert(rooms).values({ name: 'Foyer' }).returning();
      if (!foyer) throw new Error('insert failed');
      await expectDbErrorIn(tx, /rooms_name_live_uidx/, (sp) =>
        sp.insert(rooms).values({ name: 'Foyer' }),
      );
      await tx.update(rooms).set({ deletedAt: new Date() }).where(eq(rooms.id, foyer.id));
      await tx.insert(rooms).values({ name: 'Foyer' });

      await expectDbErrorIn(tx, /phases_name_live_uidx/, (sp) =>
        sp.insert(phases).values({ name: 'Phase 1' }),
      );
      const [p2] = await tx.insert(phases).values({ name: 'Phase 2' }).returning();
      expect(p2?.status).toBe('planned');
      expect(p2?.startsOn).toBeNull();
    }));

  // --- Model fix (OD-33) ---

  it('keeps the six seeded categories until M3 reshapes them', async () => {
    const cats = await db.select().from(categories).orderBy(categories.sortOrder);
    expect(cats.map((c) => c.name)).toEqual([
      'Remodel',
      'Furnishing',
      'Tech',
      'Appliances',
      'Moving',
      'Misc',
    ]);
  });

  it('Postgres enums match the Zod lists in @reparo/shared', () => {
    expect(workStatus.enumValues).toEqual([...WORK_STATUSES]);
    expect(fileKind.enumValues).toEqual([...FILE_KINDS]);
    expect(fileOwnerType.enumValues).toEqual([...FILE_OWNER_TYPES]);
  });

  it('a job covers each room once; a removed room can be added back', () =>
    withRollback(db, async (tx) => {
      const [phase] = await tx.select().from(phases).where(eq(phases.name, 'Phase 1'));
      const [kitchen] = await tx.insert(rooms).values({ name: 'Test Kitchen' }).returning();
      if (!phase || !kitchen) throw new Error('fixture missing');

      const [job] = await tx
        .insert(jobs)
        .values({
          phaseId: phase.id,
          name: 'Paint — Phase 1',
          spec: 'SW Alabaster',
        })
        .returning();
      if (!job) throw new Error('insert failed');
      expect(job.status).toBe('unstarted');
      expect(job.vendorId).toBeNull();

      const [jr] = await tx
        .insert(jobRooms)
        .values({ jobId: job.id, roomId: kitchen.id })
        .returning();
      if (!jr) throw new Error('insert failed');
      expect(jr.spec).toBeNull(); // same as the job
      expect(jr.status).toBe('unstarted');

      await expectDbErrorIn(tx, /job_rooms_job_room_live_uidx/, (sp) =>
        sp.insert(jobRooms).values({ jobId: job.id, roomId: kitchen.id }),
      );
      await tx.update(jobRooms).set({ deletedAt: new Date() }).where(eq(jobRooms.id, jr.id));
      const [again] = await tx
        .insert(jobRooms)
        .values({ jobId: job.id, roomId: kitchen.id, spec: 'Accent wall: SW Naval' })
        .returning();
      expect(again?.spec).toBe('Accent wall: SW Naval');

      // Another job in another phase can cover the same room.
      const [p2] = await tx.insert(phases).values({ name: 'Test Phase 2' }).returning();
      if (!p2) throw new Error('insert failed');
      const [job2] = await tx
        .insert(jobs)
        .values({ phaseId: p2.id, name: 'Paint — Phase 2' })
        .returning();
      if (!job2) throw new Error('insert failed');
      await tx.insert(jobRooms).values({ jobId: job2.id, roomId: kitchen.id });
    }));

  it('jobs need a real phase and, if set, a real vendor; job rooms need a real job and room', () =>
    withRollback(db, async (tx) => {
      const none = '00000000-0000-0000-0000-000000000000';
      const [phase] = await tx.select().from(phases).where(eq(phases.name, 'Phase 1'));
      if (!phase) throw new Error('fixture missing');
      await expectDbErrorIn(tx, /jobs_phase_id_phases_id_fk/, (sp) =>
        sp.insert(jobs).values({ phaseId: none, name: 'x' }),
      );
      await expectDbErrorIn(tx, /jobs_vendor_id_vendors_id_fk/, (sp) =>
        sp.insert(jobs).values({ phaseId: phase.id, vendorId: none, name: 'x' }),
      );
      const [job] = await tx.insert(jobs).values({ phaseId: phase.id, name: 'x' }).returning();
      if (!job) throw new Error('insert failed');
      await expectDbErrorIn(tx, /job_rooms_room_id_rooms_id_fk/, (sp) =>
        sp.insert(jobRooms).values({ jobId: job.id, roomId: none }),
      );
      await expectDbErrorIn(tx, /job_rooms_job_id_jobs_id_fk/, (sp) =>
        sp.insert(jobRooms).values({ jobId: none, roomId: none }),
      );
    }));

  // --- M2 (OD-44) ---

  it('the items table is gone and jobs no longer have an item', async () => {
    const tables = await client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tablename = 'items'`;
    expect(tables[0]?.n).toBe(0);
    const cols = await client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name = 'jobs' AND column_name = 'item_id'`;
    expect(cols[0]?.n).toBe(0);
  });

  it('a job can name a vendor; a vendor in use cannot be hard-deleted', () =>
    withRollback(db, async (tx) => {
      const [phase] = await tx.select().from(phases).where(eq(phases.name, 'Phase 1'));
      const [tj] = await tx
        .insert(vendors)
        .values({ name: 'TJ', trade: 'Demo crew', phone: '555-0100' })
        .returning();
      if (!phase || !tj) throw new Error('fixture missing');
      expect(tj.email).toBe('');
      expect(tj.deletedAt).toBeNull();
      const [job] = await tx
        .insert(jobs)
        .values({ phaseId: phase.id, vendorId: tj.id, name: 'Demo week' })
        .returning();
      expect(job?.vendorId).toBe(tj.id);
      await expectDbErrorIn(tx, /jobs_vendor_id_vendors_id_fk/, (sp) =>
        sp.delete(vendors).where(eq(vendors.id, tj.id)),
      );
    }));

  it('live vendor names are unique ignoring case; archiving frees the name', () =>
    withRollback(db, async (tx) => {
      const [brian] = await tx.insert(vendors).values({ name: 'Brian' }).returning();
      if (!brian) throw new Error('insert failed');
      await expectDbErrorIn(tx, /vendors_name_live_uidx/, (sp) =>
        sp.insert(vendors).values({ name: 'brian' }),
      );
      await tx.update(vendors).set({ deletedAt: new Date() }).where(eq(vendors.id, brian.id));
      await tx.insert(vendors).values({ name: 'Brian' });
    }));

  it('has row level security enabled on every table, with no policies', async () => {
    const rows = await client<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY relname`;
    expect(rows.map((r) => [r.relname, r.relrowsecurity])).toEqual([
      ['categories', true],
      ['files', true],
      ['job_rooms', true],
      ['jobs', true],
      ['members', true],
      ['phases', true],
      ['rooms', true],
      ['vendors', true],
    ]);
    const policies = await client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`;
    expect(policies[0]?.n).toBe(0);
  });
});
