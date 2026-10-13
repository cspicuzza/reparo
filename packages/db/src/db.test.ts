import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { runMigrations } from './migrate';
import { files, members } from './schema';
import { parseMembers, seedMembers } from './seed';

// Integration tests against a real Postgres. Locally that's Supabase (`supabase start`,
// port 54322); set DATABASE_URL to point anywhere else. Migrations target `public`, so each
// run drops and recreates the test tables and the drizzle migrations schema first.
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
    await client.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await client.unsafe('DROP TABLE IF EXISTS files, members CASCADE');
    await client.unsafe('DROP TYPE IF EXISTS member_role, file_kind, file_owner_type CASCADE');
    await runMigrations(databaseUrl);
  });

  afterAll(async () => {
    await client.end();
  });

  it('applies both migrations', async () => {
    const rows = await client<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
    expect(rows[0]?.n).toBe(2);
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

  it('seeds members and is idempotent (re-seed updates role, keeps display name)', async () => {
    expect(await seedMembers(databaseUrl, MEMBERS)).toBe(3);
    await db
      .update(members)
      .set({ displayName: 'Chris Spicuzza' })
      .where(eq(members.email, 'chris@example.com'));
    expect(
      await seedMembers(databaseUrl, 'chris@example.com:admin,viewer@example.com:editor'),
    ).toBe(2);

    const all = await db.select().from(members).orderBy(members.email);
    expect(all.map((m) => [m.email, m.role, m.displayName])).toEqual([
      ['chris@example.com', 'admin', 'Chris Spicuzza'],
      ['editor@example.com', 'editor', 'editor'],
      ['viewer@example.com', 'editor', 'viewer'],
    ]);
  });

  it('rejects an uppercase email and an unknown role at the database', async () => {
    await expectDbError(
      db.insert(members).values({ email: 'Upper@example.com', displayName: 'x' }),
      /members_email_lowercase/,
    );
    await expect(
      client.unsafe(
        `INSERT INTO members (email, display_name, role) VALUES ('r@example.com','r','owner')`,
      ),
    ).rejects.toThrow(/invalid input value for enum member_role/);
  });

  it('set_updated_at trigger bumps updated_at on update', async () => {
    const [before] = await db.select().from(members).where(eq(members.email, 'chris@example.com'));
    if (!before) throw new Error('seed missing');
    await client.unsafe(`SELECT pg_sleep(0.01)`);
    await db.update(members).set({ displayName: 'Chris' }).where(eq(members.id, before.id));
    const [after] = await db.select().from(members).where(eq(members.id, before.id));
    expect(after?.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(after?.createdAt.getTime()).toBe(before.createdAt.getTime());
  });

  it('files reference a member and are indexed by owner', async () => {
    const [chris] = await db.select().from(members).where(eq(members.email, 'chris@example.com'));
    if (!chris) throw new Error('seed missing');
    const [row] = await db
      .insert(files)
      .values({
        kind: 'mockup',
        bucket: 'mockups',
        path: 'kitchen/1.png',
        mimeType: 'image/png',
        sizeBytes: 12345,
        originalName: '1.png',
        ownerType: 'work_item',
        ownerId: chris.id, // any uuid; owner tables arrive in M1
        uploadedBy: chris.id,
      })
      .returning();
    expect(row?.deletedAt).toBeNull();
    expect(row?.sortOrder).toBe(0);
    await expectDbError(
      db.insert(files).values({
        kind: 'receipt',
        bucket: 'receipts',
        path: 'x',
        mimeType: 'image/png',
        sizeBytes: 1,
        originalName: 'x',
        ownerType: 'cost_line',
        ownerId: chris.id,
        uploadedBy: '00000000-0000-0000-0000-000000000000',
      }),
      /files_uploaded_by_members_id_fk/,
    );
  });

  it('has row level security enabled on every table', async () => {
    const rows = await client<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY relname`;
    expect(rows.map((r) => [r.relname, r.relrowsecurity])).toEqual([
      ['files', true],
      ['members', true],
    ]);
    const policies = await client<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`;
    expect(policies[0]?.n).toBe(0);
    // Sanity: the migration runner itself must not have been blocked by RLS.
    expect(await db.$count(members)).toBe(3);
  });
});
