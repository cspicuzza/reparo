// `pnpm db:seed` — upsert members from MEMBERS in the repo-root .env. It has no dry run, so a
// hosted project always needs `--target=<project ref>`; it first says which database and
// storage it uses and stops if they're different stacks (OD-164).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seedMembers } from '../seed';
import { checkTarget, cliArgs } from './target';

const envFile = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { values } = cliArgs({ options: { target: { type: 'string' } } });
const { databaseUrl: url } = checkTarget(process.env, { target: values.target, confirm: true });

const n = await seedMembers(url, process.env['MEMBERS']);
console.log(`seeded ${n} member(s)`);
