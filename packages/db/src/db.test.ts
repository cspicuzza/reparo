import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, withRollback } from './client';
import { runMigrations } from './migrate';
import { files, members } from './schema';
import { parseMembers, upsertMembers } from './seed';

// Integration tests against a real Postgres (DATABASE_URL — locally, Supabase on 54322).
// Non-destructive: migrations are applied only if pending, and every test's writes happen
// inside a transaction that is rolled back, so development data is never touched.
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
    expect(rows[0]?.n).toBeGreaterThanOrEqual(2);
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

  it('has row level security enabled on every table, with no policies', async () => {
    const rows = await client<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY relname`;
    expect(rows.map((r) => [r.relname, r.relrowsecurity])).toEqual([
      ['files', true],
      ['members', true],
    ]);
    const policies = await client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`;
    expect(policies[0]?.n).toBe(0);
  });
});
