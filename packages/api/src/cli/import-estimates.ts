// `pnpm db:import-estimates` — turn the imported vendor prices into chosen estimates (OD-62,
// Q29). Reads import/spreadsheet-lines.csv. Dry run by default: it runs inside a transaction,
// prints what it made and the money before and after (which should match), and rolls back.
// `--write` keeps it.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb, Rollback } from '@reparo/db';
import { formatMoney } from '@reparo/shared';
import { csvRecords } from '../import/csv';
import { adoptImportedQuotes } from '../import/quotes';
import { ImportProblem, validateLines } from '../import/run';
import { getMoneySummary } from '../services/money';

const root = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const envFile = root('.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set; see .env.example');
const write = process.argv.slice(2).includes('--write');
const file = root('import/spreadsheet-lines.csv');
if (!existsSync(file)) throw new Error(`No lines file at ${file}`);

const { db, client } = createDb(url, { max: 1 });
try {
  const lines = validateLines(csvRecords(readFileSync(file, 'utf8')));
  await db.transaction(async (tx) => {
    const before = await getMoneySummary(tx);
    const report = await adoptImportedQuotes(tx, lines);
    const after = await getMoneySummary(tx);
    console.log(`Chosen estimates made: ${report.made.length}`);
    for (const m of report.made) console.log(`  ${m}`);
    if (report.skipped.length > 0) console.log(`Skipped:\n  ${report.skipped.join('\n  ')}`);
    console.log(
      `Available  ${formatMoney(before.availableCents)} before, ${formatMoney(after.availableCents)} after`,
    );
    if (!write) {
      console.log(
        '\nDry run: nothing was saved. Run `pnpm db:import-estimates --write` to keep it.',
      );
      throw new Rollback();
    }
    console.log('\nSaved.');
  });
} catch (e) {
  if (e instanceof ImportProblem) {
    console.error(e.message);
    process.exitCode = 1;
  } else if (!(e instanceof Rollback)) throw e;
} finally {
  await client.end();
}
