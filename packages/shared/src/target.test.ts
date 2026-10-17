import { describe, expect, it } from 'vitest';
import { confirmTarget, describeTarget } from './target';

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const LOCAL_API = 'http://127.0.0.1:54321';
const REF = 'abcdefghijklmnopqrst';
const SECRET = 's3cr3t-p4ss';

describe('describeTarget()', () => {
  it.each([
    ['127.0.0.1', LOCAL_DB, LOCAL_API],
    [
      'localhost',
      'postgresql://postgres:postgres@localhost:54322/postgres',
      'http://localhost:54321',
    ],
    ['upper case', 'postgresql://postgres:postgres@LOCALHOST:54322/postgres', LOCAL_API],
    ['IPv6', 'postgresql://postgres:postgres@[::1]:54322/postgres', 'http://[::1]:54321'],
  ])('accepts a local pair (%s)', (_name, databaseUrl, supabaseUrl) => {
    expect(describeTarget({ databaseUrl, supabaseUrl })).toMatchObject({
      ref: null,
      problem: null,
    });
  });

  it.each([
    ['direct', `postgresql://postgres:${SECRET}@db.${REF}.supabase.co:5432/postgres`],
    [
      'shared pooler',
      `postgresql://postgres.${REF}:${SECRET}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    ],
    [
      'custom role',
      `postgresql://reporter.${REF}:${SECRET}@aws-1-us-west-1.pooler.supabase.com:6543/postgres`,
    ],
  ])('accepts a hosted pair on one project (%s)', (_name, databaseUrl) => {
    const t = describeTarget({ databaseUrl, supabaseUrl: `https://${REF}.supabase.co` });
    expect(t).toMatchObject({ ref: REF, problem: null });
    expect(t.database).toContain(`(project ${REF})`);
  });

  it('refuses a hosted database with local storage (the mix-up OD-164 is about)', () => {
    const t = describeTarget({
      databaseUrl: `postgresql://postgres:${SECRET}@db.${REF}.supabase.co:5432/postgres`,
      supabaseUrl: LOCAL_API,
    });
    expect(t.problem).toBe(`The database is project ${REF} but storage is this machine.`);
    expect(t.ref).toBeNull();
  });

  it('refuses a local database with hosted storage, and two different projects', () => {
    expect(
      describeTarget({ databaseUrl: LOCAL_DB, supabaseUrl: `https://${REF}.supabase.co` }).problem,
    ).toMatch(/database is this machine but storage is project/);
    expect(
      describeTarget({
        databaseUrl: `postgresql://postgres:x@db.${REF}.supabase.co:5432/postgres`,
        supabaseUrl: 'https://zyxwvutsrqponmlkjihg.supabase.co',
      }).problem,
    ).toMatch(/project abcdefghijklmnopqrst but storage is project zyxwvutsrqponmlkjihg/);
  });

  it("refuses hosts it can't map to a project", () => {
    expect(
      describeTarget({
        databaseUrl: `postgresql://postgres:x@db.${REF}.supabase.co:5432/postgres`,
        supabaseUrl: 'https://api.example.com',
      }).problem,
    ).toMatch(/storage host isn't this machine or a Supabase project host/);
    expect(
      describeTarget({
        databaseUrl: 'postgresql://postgres:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
        supabaseUrl: `https://${REF}.supabase.co`,
      }).problem,
    ).toMatch(/database host isn't/);
  });

  it('throws on a URL it cannot parse, naming the variable but never its value', () => {
    expect(() => describeTarget({ databaseUrl: 'not a url', supabaseUrl: LOCAL_API })).toThrow(
      TypeError,
    );
    // An unencoded "#" in a password passes the postgres:// check but doesn't parse.
    const bad = `postgres://postgres:pa#${SECRET}@db.${REF}.supabase.co:5432/postgres`;
    let message = '';
    try {
      describeTarget({ databaseUrl: bad, supabaseUrl: LOCAL_API });
    } catch (e) {
      message = e instanceof Error ? `${e.message} ${JSON.stringify(e)}` : String(e);
    }
    expect(message).toMatch(/DATABASE_URL isn't a valid URL/);
    expect(message).not.toContain(SECRET);
  });

  it('never prints the password', () => {
    const t = describeTarget({
      databaseUrl: `postgresql://postgres.${REF}:${SECRET}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      supabaseUrl: `https://${REF}.supabase.co`,
    });
    expect(JSON.stringify(t)).not.toContain(SECRET);
    expect(t.database).toBe(`aws-0-us-east-1.pooler.supabase.com:6543/postgres (project ${REF})`);
  });
});

describe('confirmTarget()', () => {
  const hosted = { ref: REF };
  const local = { ref: null };

  it('lets local runs through and refuses a --target on them', () => {
    expect(confirmTarget(local, { flag: undefined, needed: true })).toBeNull();
    expect(confirmTarget(local, { flag: REF, needed: true })).toMatch(/on this machine/);
  });

  it('needs --target naming the project to write to a hosted one', () => {
    expect(confirmTarget(hosted, { flag: undefined, needed: true })).toBe(
      `This writes to project ${REF}. Run it again with --target=${REF} to confirm.`,
    );
    expect(confirmTarget(hosted, { flag: 'other', needed: true })).toBe(
      `--target=other doesn't match project ${REF}.`,
    );
    expect(confirmTarget(hosted, { flag: REF, needed: true })).toBeNull();
  });

  it('lets a hosted dry run through without --target, but not with a wrong one', () => {
    expect(confirmTarget(hosted, { flag: undefined, needed: false })).toBeNull();
    expect(confirmTarget(hosted, { flag: 'other', needed: false })).toMatch(/doesn't match/);
  });
});
