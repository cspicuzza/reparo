import { createDb, eq, jobs, phases, rooms, withRollback } from '@reparo/db';
import { prepareTestDatabase } from '@reparo/db/testing';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { csvRecords } from './csv';
import { adoptImportedQuotes } from './quotes';
import { ImportProblem, runImport, validateLines } from './run';
import { getMoneySummary } from '../services/money';
import { estimates } from '@reparo/db';

// The spreadsheet import against its own test database (`reparo_test_import`), with made-up
// lines in the lines file's shape. Each test rolls back.
const envFile = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL must be set to run @reparo/api tests');
const databaseUrl = await prepareTestDatabase(url, 'import');

const HEADER =
  'id,action,kind,phase,room,category,job,job_match,vendor,trade,name,amount,store,link,model_number,quantity,notes,flags,source';
const CSV = [
  HEADER,
  'L1,import,budget,,,,,,,,Starting balance,"300,000.00",,,,1,2026-09-03,,Overview!B3',
  'L2,import,vendor,,,,,,TJ,Demo,TJ,,,,,1,,,Remodel!D2',
  'L3,import,job_cost,Phase 1,,,Demo,Demo; Demo week,TJ,,Estimate,"16,500.00",,,,1,Required tier,,Remodel!C2',
  'L4,import,job_cost,Phase 1,,,Moving,Moving,,,Moving truck,"17,500.00",,,,1,,,Moving!B1',
  'L5,import,job_cost,Phase 1,,,Moving,Moving,,,Food,500.00,,,,1,,,Moving!B4',
  'L6,import,shopping,Phase 1,Test Living,Furniture,,,,,Couch,"5,000.00",Castlery,https://www.castlery.com/x,,1,,,Furniture!B3',
  'L7,import,shopping,Phase 1,Laundry Room,Appliances,,,,,Washer Dryer,"3,621.00",,,,1,"price 3,400.00 + tax 221.00",,Appliances!D3',
  'L8,import,shopping,Phase 1,,Appliances,Fireplace,Fireplace,,,Fireplace insert,"6,597.00",,,OR76,1,,,Appliances!D4',
  'L9,skip,shopping,Phase 1,,Other,,,,,Slot machines,"7,000.00",,,,1,,,Furniture!B69',
  'L10,import,shopping,Phase 1,Test Living,Decor,,,,,Faux tree,,,,,2,,,Furniture!B8',
].join('\n');

describe('spreadsheet import', () => {
  const { db, client } = createDb(databaseUrl, { max: 2 });
  afterAll(async () => {
    await client.end();
  });

  it('checks every row first and reports problems by line id', () => {
    const bad = csvRecords(`${HEADER}\nL1,import,shopping,Phase 1,,Rugs,,,,,,12.345,,,,0,,,x`);
    expect(() => validateLines(bad)).toThrow(ImportProblem);
    try {
      validateLines(bad);
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toMatch(/L1 name: Give it a name/);
      expect(message).toMatch(/L1 amount: Enter an amount like 1,234.56/);
      expect(message).toMatch(/L1 quantity: Enter a whole number, 1 or more/);
    }
  });

  it('matches existing jobs and rooms, creates the rest, and the money adds up', () =>
    withRollback(db, async (tx) => {
      const [phase1] = await tx.select().from(phases).where(eq(phases.name, 'Phase 1'));
      if (!phase1) throw new Error('seed missing');
      // What the household already has: the Demo job (different case) and the Fireplace job.
      await tx.insert(jobs).values([
        { phaseId: phase1.id, name: 'demo' },
        { phaseId: phase1.id, name: 'Fireplace' },
      ]);
      await tx.insert(rooms).values({ name: 'Test Living' });

      const report = await runImport(tx, validateLines(csvRecords(CSV)));
      expect(report.made).toEqual({
        vendors: 1,
        rooms: 1,
        jobs: 1,
        costLines: 3,
        shoppingLines: 4,
      });
      expect(report.skipped).toBe(1);

      const all = await tx.select().from(jobs).where(eq(jobs.phaseId, phase1.id));
      expect(all.map((j) => j.name).sort()).toEqual(['Fireplace', 'Moving', 'demo']);
      expect(all.find((j) => j.name === 'demo')?.vendorId).not.toBeNull();
      const laundry = await tx.select().from(rooms).where(eq(rooms.name, 'Laundry Room'));
      expect(laundry).toHaveLength(1);

      const m = report.money;
      expect(m.pool).toMatchObject({ startingCents: 30000000, asOf: '2026-09-03' });
      const committed = 1650000 + 1750000 + 50000 + 500000 + 362100 + 659700;
      expect([m.spentCents, m.committedCents, m.availableCents]).toEqual([
        0,
        committed,
        30000000 - committed,
      ]);
    }));

  it('refuses a database that already has money in it', () =>
    withRollback(db, async (tx) => {
      const lines = validateLines(csvRecords(CSV));
      await runImport(tx, lines);
      await expect(runImport(tx, lines)).rejects.toThrow(
        /already has .* so importing would count money twice/,
      );
    }));

  it('turns the imported vendor prices into chosen estimates without moving the money (Q29)', () =>
    withRollback(db, async (tx) => {
      const lines = validateLines(csvRecords(CSV));
      await runImport(tx, lines);
      const before = await getMoneySummary(tx);
      const report = await adoptImportedQuotes(tx, lines);
      expect(report.made).toEqual(['Demo: Estimate']);
      const [e] = await tx.select().from(estimates);
      expect(e).toMatchObject({ status: 'chosen', amountCents: 1650000 });
      expect(e?.costLineId).not.toBeNull();
      expect((await getMoneySummary(tx)).availableCents).toBe(before.availableCents);
      const again = await adoptImportedQuotes(tx, lines);
      expect(again.made).toEqual([]);
      expect(again.skipped).toEqual(['L3 (Demo, TJ): Demo already has estimates']);
    }));
});
