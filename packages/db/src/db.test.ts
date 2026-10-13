import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, withRollback, type Db } from './client';
import { runMigrations } from './migrate';
import { files, items, members, phases, rooms, workItems } from './schema';
import { parseMembers, upsertMembers } from './seed';

// Integration tests against a real Postgres (DATABASE_URL — locally, Supabase on 54322).
// Non-destructive: migrations are applied only if pending, and every test's writes happen
// inside a transaction that is rolled back, so development data is never touched.
// Vitest doesn't read .env; load the repo root one like dev.ts does. A DATABASE_URL already in
// the shell wins (observed: loadEnvFile never overrides existing variables).
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL must be set to run @reparo/db tests');
const databaseUrl: string = url;

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

  beforeAll(async () => {
    await runMigrations(databaseUrl); // idempotent: applies only what's pending
  });

  afterAll(async () => {
    await client.end();
  });

  it('has both migrations applied', async () => {
    const rows = await client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
    expect(rows[0]?.n).toBeGreaterThanOrEqual(3);
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
          ownerType: 'work_item',
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
          ownerType: 'cost_line',
          ownerId: '00000000-0000-0000-0000-000000000000',
          uploadedBy: '00000000-0000-0000-0000-000000000000',
        }),
        /files_uploaded_by_members_id_fk/,
      ),
    );
  });

  // --- M1 (OD-27) ---

  it('seeds Phase 1 and the starter item catalog', async () => {
    const [phase] = await db.select().from(phases).where(eq(phases.name, 'Phase 1'));
    expect(phase?.status).toBe('active');
    expect(phase?.deletedAt).toBeNull();

    const catalog = await db.select().from(items).orderBy(items.sortOrder);
    expect(catalog.length).toBeGreaterThanOrEqual(23);
    expect(catalog[0]?.name).toBe('Demo');
    expect(catalog.map((i) => i.name)).toEqual(
      expect.arrayContaining([
        'Paint',
        'Flooring',
        'Bathroom Remodel',
        'Ceiling Fans',
        'Appliances',
      ]),
    );
    expect(catalog.every((i) => i.retiredAt === null)).toBe(true);
  });

  it('rejects a duplicate item name and an unknown work status', async () => {
    await withRollback(db, (tx) =>
      expectDbError(tx.insert(items).values({ name: 'Paint' }), /items_name_unique/),
    );
    await withRollback(db, async (tx) => {
      const [phase] = await tx.select().from(phases).where(eq(phases.name, 'Phase 1'));
      const [paint] = await tx.select().from(items).where(eq(items.name, 'Paint'));
      if (!phase || !paint) throw new Error('seed missing');
      await expectDbError(
        tx.execute(
          `INSERT INTO work_items (item_id, phase_id, status) VALUES ('${paint.id}','${phase.id}','done')`,
        ),
        /invalid input value for enum work_status/,
      );
    });
  });

  it('allows one live house-wide default and one live override per item and room', () =>
    withRollback(db, async (tx) => {
      const [phase] = await tx.select().from(phases).where(eq(phases.name, 'Phase 1'));
      const [paint] = await tx.select().from(items).where(eq(items.name, 'Paint'));
      const [kitchen] = await tx.insert(rooms).values({ name: 'Kitchen' }).returning();
      if (!phase || !paint || !kitchen) throw new Error('setup failed');
      const base = { itemId: paint.id, phaseId: phase.id };

      // House-wide default (room NULL): only one live row per item.
      await tx.insert(workItems).values({ ...base, spec: 'Eggshell, SW Alabaster' });
      await expectDbErrorIn(tx, /work_items_item_default_live_uidx/, (sp) =>
        sp.insert(workItems).values({ ...base }),
      );

      // Room override: only one live row per (item, room).
      const [override] = await tx
        .insert(workItems)
        .values({ ...base, roomId: kitchen.id, spec: 'Satin, SW Sea Salt' })
        .returning();
      if (!override) throw new Error('insert failed');
      await expectDbErrorIn(tx, /work_items_item_room_live_uidx/, (sp) =>
        sp.insert(workItems).values({ ...base, roomId: kitchen.id }),
      );

      // Soft-deleting the override frees the slot; the default is untouched.
      await tx
        .update(workItems)
        .set({ deletedAt: new Date() })
        .where(eq(workItems.id, override.id));
      const [again] = await tx
        .insert(workItems)
        .values({ ...base, roomId: kitchen.id })
        .returning();
      expect(again?.status).toBe('unstarted');
      expect(again?.deletedAt).toBeNull();

      // A different item in the same room is fine.
      const [floors] = await tx.select().from(items).where(eq(items.name, 'Flooring'));
      if (!floors) throw new Error('seed missing');
      await tx
        .insert(workItems)
        .values({ itemId: floors.id, phaseId: phase.id, roomId: kitchen.id });
    }));

  it('work items need a real phase, item, and room', () =>
    withRollback(db, async (tx) => {
      const [paint] = await tx.select().from(items).where(eq(items.name, 'Paint'));
      if (!paint) throw new Error('seed missing');
      await expectDbError(
        tx.insert(workItems).values({
          itemId: paint.id,
          phaseId: '00000000-0000-0000-0000-000000000000',
        }),
        /work_items_phase_id_phases_id_fk/,
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

  it('has row level security enabled on every table, with no policies', async () => {
    const rows = await client<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY relname`;
    expect(rows.map((r) => [r.relname, r.relrowsecurity])).toEqual([
      ['files', true],
      ['items', true],
      ['members', true],
      ['phases', true],
      ['rooms', true],
      ['work_items', true],
    ]);
    const policies = await client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`;
    expect(policies[0]?.n).toBe(0);
  });
});
