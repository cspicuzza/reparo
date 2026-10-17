// `pnpm db:import-images` — attach the spreadsheet's product images to the shopping lines the
// import made (OD-61). Reads import/spreadsheet-images.csv, import/spreadsheet-lines.csv and
// the pictures in import/images/ (all gitignored). Dry run by default: it says what it would
// attach and what it can't match, and uploads nothing. `--write` uploads them. Every run first
// says which database and storage it uses and stops if they're different stacks; writing to a
// hosted project needs `--target=<project ref>` (OD-164).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb } from '@reparo/db';
import { checkTarget, cliArgs } from '@reparo/db/cli';
import { FILE_MAX_BYTES, FILE_MIME_TYPES, serverEnv } from '@reparo/shared';
import { FILES_BUCKET } from '../handler';
import { createSupabaseStorage, StorageError } from '../storage/storage';
import { csvRecords } from '../import/csv';
import { attachImages, importingMember, planImages, validateImages } from '../import/images';
import { ImportProblem, validateLines } from '../import/run';

const root = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const envFile = root('.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const { values } = cliArgs({
  options: { write: { type: 'boolean' }, target: { type: 'string' } },
});
const write = values.write ?? false;
const { databaseUrl: url } = checkTarget(process.env, { target: values.target, confirm: write });
const listFile = root('import/spreadsheet-images.csv');
const linesFile = root('import/spreadsheet-lines.csv');
const imageDir = root('import/images');
for (const f of [listFile, linesFile, imageDir]) {
  if (!existsSync(f)) throw new Error(`Missing ${f}`);
}

const { db, client } = createDb(url, { max: 1 });
try {
  const images = validateImages(csvRecords(readFileSync(listFile, 'utf8')));
  const lines = validateLines(csvRecords(readFileSync(linesFile, 'utf8')));
  for (const img of images) {
    if (img.action === 'import' && !existsSync(`${imageDir}/${img.image}`)) {
      throw new ImportProblem(`${img.id}: import/images/${img.image} isn't there`);
    }
  }
  const plan = await planImages(db, images, lines);
  const count = [...plan.attach.values()].reduce((n, e) => n + e.images.length, 0);

  console.log(`Would attach ${count} picture(s) to ${plan.attach.size} shopping line(s).`);
  if (plan.alreadyHas.length > 0) {
    console.log(`Left alone, already have pictures: ${plan.alreadyHas.join(', ')}.`);
  }
  if (plan.skipped.length > 0) {
    console.log(
      `Skipped in the list (see import/REVIEW.md): ${plan.skipped.map((s) => s.id).join(', ')}.`,
    );
  }
  if (plan.unmatched.length > 0) {
    console.log(`\nCouldn't match:\n${plan.unmatched.join('\n')}`);
  }

  if (!write) {
    console.log('\nDry run: nothing was uploaded. Run `pnpm db:import-images --write` to do it.');
  } else if (count > 0) {
    // The same storage the API uses (SUPABASE_URL, SUPABASE_SECRET_KEY from .env).
    const env = serverEnv(process.env);
    const storage = createSupabaseStorage({
      url: env.SUPABASE_URL,
      secretKey: env.SUPABASE_SECRET_KEY,
      bucket: FILES_BUCKET,
      fileSizeLimit: FILE_MAX_BYTES,
      allowedMimeTypes: FILE_MIME_TYPES,
    });
    const memberId = await importingMember(db);
    const done = await attachImages(
      db,
      storage,
      plan,
      (name) => readFileSync(`${imageDir}/${name}`),
      memberId,
      (n) => process.stdout.write(`\rUploaded ${n} of ${count}`),
    );
    console.log(`\nAttached ${done} picture(s).`);
  }
} catch (e) {
  if (e instanceof ImportProblem) {
    console.error(e.message);
    process.exitCode = 1;
  } else if (e instanceof StorageError) {
    console.error(`\n${e.message}`);
    console.error('Run it again once storage is reachable; lines that have pictures are skipped.');
    process.exitCode = 1;
  } else throw e;
} finally {
  await client.end();
}
