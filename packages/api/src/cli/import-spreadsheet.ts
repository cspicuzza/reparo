// `pnpm db:import` — load the reviewed spreadsheet lines file into DATABASE_URL (OD-36).
// Dry run by default: everything is written inside a transaction, the totals are printed, and
// the transaction is rolled back. `pnpm db:import --write` keeps it. Every run first says
// which database and storage it uses and stops if they're different stacks; writing to a
// hosted project needs `--target=<project ref>` (OD-164).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb, Rollback } from '@reparo/db';
import { checkTarget, cliArgs } from '@reparo/db/cli';
import { formatMoney } from '@reparo/shared';
import { csvRecords } from '../import/csv';
import { ImportProblem, runImport, validateLines, type ImportReport } from '../import/run';

const envFile = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const { values, positionals } = cliArgs({
  options: { write: { type: 'boolean' }, target: { type: 'string' } },
  allowPositionals: true,
});
const write = values.write ?? false;
const { databaseUrl: url } = checkTarget(process.env, { target: values.target, confirm: write });
const fileArg = positionals[0];
const file =
  fileArg ?? fileURLToPath(new URL('../../../../import/spreadsheet-lines.csv', import.meta.url));
if (!existsSync(file)) throw new Error(`No lines file at ${file}`);

function print(report: ImportReport) {
  const m = report.money;
  const { made } = report;
  console.log(
    `Created ${made.vendors} vendor(s), ${made.rooms} room(s), ${made.jobs} job(s), ` +
      `${made.costLines} cost line(s), ${made.shoppingLines} shopping line(s); skipped ${report.skipped}.`,
  );
  console.log(`Budget     ${formatMoney(m.pool.poolCents)}`);
  console.log(`Spent      ${formatMoney(m.spentCents)}`);
  console.log(`Committed  ${formatMoney(m.committedCents)}`);
  console.log(`Available  ${formatMoney(m.availableCents)}`);
}

const lines = validateLines(csvRecords(readFileSync(file, 'utf8')));
const { db, client } = createDb(url, { max: 1 });
try {
  await db.transaction(async (tx) => {
    const report = await runImport(tx, lines);
    print(report);
    if (!write) {
      console.log('\nDry run: nothing was saved. Run `pnpm db:import --write` to keep it.');
      throw new Rollback();
    }
    console.log('\nSaved.');
  });
} catch (e) {
  if (e instanceof ImportProblem) {
    console.error(e.message);
    process.exitCode = 1;
  } else if (!(e instanceof Rollback)) {
    throw e;
  }
} finally {
  await client.end();
}
