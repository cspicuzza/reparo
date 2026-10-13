import { defineConfig } from 'drizzle-kit';

// drizzle-kit only needs DATABASE_URL; it never imports the app's env schema.
const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set; see .env.example');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
