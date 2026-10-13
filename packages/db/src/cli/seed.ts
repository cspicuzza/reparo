// `pnpm db:seed` — upsert members from MEMBERS in the repo-root .env.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seedMembers } from '../seed';

const envFile = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set; see .env.example');

const n = await seedMembers(url, process.env['MEMBERS']);
console.log(`seeded ${n} member(s)`);
