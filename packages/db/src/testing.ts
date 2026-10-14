// Test-only helpers (`@reparo/db/testing`). Not exported from the package root, so nothing in
// the app can import them by accident.
import postgres from 'postgres';
import { runMigrations } from './migrate';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Give a test suite its own database, rebuilt from zero: `reparo_test_<suite>` on the same
 * local Postgres as `devUrl` (the dev `DATABASE_URL`), dropped, recreated, and migrated from
 * 0000. The dev database is never touched. Each package uses its own suite name so two test
 * runs can't drop each other's database. Returns the test database URL.
 *
 * Refuses any host that isn't this machine: a suite drops a database on every run, so it must
 * never be able to reach a hosted one.
 */
export async function prepareTestDatabase(devUrl: string, suite: string): Promise<string> {
  if (!/^[a-z][a-z0-9_]*$/.test(suite)) throw new Error(`Bad test suite name "${suite}"`);
  const url = new URL(devUrl);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `Refusing to run tests against ${url.hostname}: test databases are dropped and rebuilt, ` +
        'so DATABASE_URL must point at a local Postgres (localhost / 127.0.0.1).',
    );
  }

  const name = `reparo_test_${suite}`;
  const testUrl = new URL(devUrl);
  testUrl.pathname = `/${name}`;

  // Connect to the dev database only to issue DROP/CREATE DATABASE; no reads or writes there.
  const admin = postgres(devUrl, { max: 1, onnotice: () => {} });
  try {
    // WITH (FORCE) ends any leftover connection from an aborted run (Postgres 13+:
    // https://www.postgresql.org/docs/current/sql-dropdatabase.html).
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE "${name}"`);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === '42501') {
      const user = decodeURIComponent(url.username) || 'your database user';
      throw new Error(
        `Postgres refused to create the test database "${name}": ${user} has no CREATEDB ` +
          `permission. Grant it once as a superuser: ALTER ROLE "${user}" CREATEDB;`,
        { cause: e },
      );
    }
    throw e;
  } finally {
    await admin.end();
  }

  await runMigrations(testUrl.toString());
  return testUrl.toString();
}
