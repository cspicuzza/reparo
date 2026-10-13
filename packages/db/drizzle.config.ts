import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not read .env itself. Load the repo-root .env if it exists (Node ≥ 24.10:
// process.loadEnvFile is stable — nodejs/node doc/api/process.md). Existing shell variables win.
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (!process.env['DATABASE_URL'] && existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env['DATABASE_URL'];
if (!url)
  throw new Error(
    'DATABASE_URL is not set: copy .env.example to .env at the repo root (see CLAUDE.md)',
  );

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
