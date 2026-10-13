import { describe, expect, it } from 'vitest';
import { EnvError, serverEnv, webEnv } from './env';

const goodWeb = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};
const goodServer = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  SUPABASE_JWKS_URL: 'http://127.0.0.1:54321/auth/v1/.well-known/jwks.json',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  APP_ENV: 'local',
};

describe('webEnv()', () => {
  it('returns typed values and ignores extra keys', () => {
    expect(webEnv({ ...goodWeb, MODE: 'development' })).toEqual(goodWeb);
  });

  it('lists every problem at once', () => {
    let err: unknown;
    try {
      webEnv({ VITE_SUPABASE_URL: 'not a url' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(EnvError);
    const problems = (err as EnvError).problems;
    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).toMatch(/VITE_SUPABASE_URL: .*URL/);
    expect(problems.join('\n')).toMatch(/VITE_SUPABASE_PUBLISHABLE_KEY/);
    expect((err as Error).message).toMatch(/See \.env\.example/);
  });
});

describe('serverEnv()', () => {
  it('accepts a valid local config', () => {
    expect(serverEnv(goodServer)).toEqual(goodServer);
  });

  it('rejects an empty key, a non-postgres URL, and a bad APP_ENV', () => {
    expect(() => serverEnv({ ...goodServer, SUPABASE_SECRET_KEY: '' })).toThrow(EnvError);
    expect(() => serverEnv({ ...goodServer, SUPABASE_JWKS_URL: 'nope' })).toThrow(
      /SUPABASE_JWKS_URL/,
    );
    expect(() => serverEnv({ ...goodServer, DATABASE_URL: 'mysql://x' })).toThrow(
      /DATABASE_URL must start with postgres/,
    );
    expect(() => serverEnv({ ...goodServer, APP_ENV: 'staging' })).toThrow(
      /APP_ENV must be one of local, preview, production/,
    );
  });

  it('rejects a missing variable with a readable message', () => {
    const missing: Record<string, string> = { ...goodServer };
    delete missing['DATABASE_URL'];
    expect(() => serverEnv(missing)).toThrow(/DATABASE_URL/);
  });

  it('rejects non-object input', () => {
    expect(() => serverEnv(undefined)).toThrow(EnvError);
  });
});
