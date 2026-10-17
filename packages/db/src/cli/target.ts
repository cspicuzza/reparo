// The command-line side of OD-164, shared by `pnpm db:seed` and the import scripts
// (`@reparo/db/cli`). The checks themselves are pure, in @reparo/shared (target.ts).
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { confirmTarget, describeTarget, serverEnvSchema } from '@reparo/shared';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * `util.parseArgs` with `strict` on, so a mistyped flag (`--wirte`) is an error instead of a
 * quiet dry run (https://nodejs.org/docs/latest-v24.x/api/util.html#utilparseargsconfig).
 */
export function cliArgs<T extends Omit<ParseArgsConfig, 'args' | 'strict'>>(config: T) {
  try {
    return parseArgs({ ...config, strict: true });
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

const targetEnv = serverEnvSchema.pick({ DATABASE_URL: true, SUPABASE_URL: true });

/**
 * Print where this run reads and writes, then stop (exit 1, nothing done) unless the database
 * and storage are one stack and, when `confirm` is set and the stack is hosted, `--target`
 * names its project. A shell variable wins over `.env` (Node's loadEnvFile doesn't overwrite),
 * which is how the two could end up pointing at different stacks.
 */
export function checkTarget(
  env: NodeJS.ProcessEnv,
  { target, confirm }: { target: string | undefined; confirm: boolean },
): { databaseUrl: string } {
  const parsed = targetEnv.safeParse(env);
  if (!parsed.success) {
    fail(
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n') +
        '\nSee .env.example.',
    );
  }
  let t: ReturnType<typeof describeTarget>;
  try {
    t = describeTarget({
      databaseUrl: parsed.data.DATABASE_URL,
      supabaseUrl: parsed.data.SUPABASE_URL,
    });
  } catch (e) {
    // describeTarget's own message names the variable, never its value (it holds a password).
    fail(e instanceof Error ? e.message : 'DATABASE_URL or SUPABASE_URL is not a valid URL.');
  }
  console.log(`Database: ${t.database}\nStorage:  ${t.storage}\n`);
  const problem = t.problem ?? confirmTarget(t, { flag: target, needed: confirm });
  if (problem) fail(problem);
  return { databaseUrl: parsed.data.DATABASE_URL };
}
