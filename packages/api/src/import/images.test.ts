import { createDb, eq, files, members, phases, withRollback, type Db } from '@reparo/db';
import { roomCreateSchema } from '@reparo/shared';
import { prepareTestDatabase } from '@reparo/db/testing';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { listManyFiles } from '../services/files';
import { createShoppingLine } from '../services/shopping-lines';
import { createRoom } from '../services/rooms';
import { createFakeStorage } from '../storage/fake';
import { csvRecords } from './csv';
import { attachImages, importingMember, planImages, validateImages } from './images';
import { ImportProblem, validateLines } from './run';

// The spreadsheet image import (OD-61) against its own test database (`reparo_test_images`)
// and the in-memory storage. Each test rolls back.
const envFile = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL must be set to run @reparo/api tests');
const databaseUrl = await prepareTestDatabase(url, 'images');

const LINES = [
  'id,action,kind,phase,room,category,job,job_match,vendor,trade,name,amount,store,link,model_number,quantity,notes,flags,source',
  'L1,import,shopping,Phase 1,Test Living,Furniture,,,,,Couch,"5,000.00",,,,1,,,Furniture!B3',
  'L2,import,shopping,Phase 1,Test Living,Rugs,,,,,Rug,900.00,,,,1,,,Furniture!B4',
  'L3,import,shopping,Phase 1,,Decor,,,,,Faux tree,,,,,1,,,Furniture!B8',
  'L4,import,budget,,,,,,,,Starting balance,"300,000.00",,,,1,2026-09-03,,Overview!B3',
].join('\n');
const IMAGES = (rows: string[]) => ['id,action,line_id,line,image,source,note', ...rows].join('\n');

describe('spreadsheet images', () => {
  const { db, client } = createDb(databaseUrl, { max: 2 });
  afterAll(async () => {
    await client.end();
  });

  async function fixtures(tx: Db) {
    const [phase] = await tx.select().from(phases).where(eq(phases.name, 'Phase 1'));
    if (!phase) throw new Error('no Phase 1');
    const living = await createRoom(tx, roomCreateSchema.parse({ name: 'Test Living' }));
    const cats = await tx.query.categories.findMany();
    const cat = (n: string) => cats.find((c) => c.name === n)?.id ?? '';
    const line = (name: string, roomId: string | null, category: string) =>
      createShoppingLine(tx, {
        phaseId: phase.id,
        roomId,
        categoryId: cat(category),
        jobId: null,
        name,
        link: '',
        store: '',
        modelNumber: '',
        quantity: 1,
        priceCents: 100,
        notes: '',
      });
    const couch = await line('Couch', living.id, 'Furniture');
    const rug = await line('rug', living.id, 'Rugs'); // case differs from the lines file
    await tx
      .insert(members)
      .values({ email: 'admin@example.com', displayName: 'a', role: 'admin' });
    return { couch, rug };
  }

  it('checks the list first: every import row names a line and a picture file', () => {
    expect(() =>
      validateImages(csvRecords(IMAGES(['I1,import,,,I1.png,,', 'I2,import,L1,,notes.txt,,']))),
    ).toThrow(ImportProblem);
    expect(validateImages(csvRecords(IMAGES(['I1,skip,,,I1.png,,heading row'])))).toHaveLength(1);
  });

  it('matches by name and room, keeps the sheet order, and a second run adds nothing', () =>
    withRollback(db, async (tx) => {
      const { couch, rug } = await fixtures(tx);
      const lines = validateLines(csvRecords(LINES));
      const images = validateImages(
        csvRecords(
          IMAGES([
            'I1,skip,,,I1.png,Furniture!row 2,On a section heading row',
            'I2,import,L1,Couch,I2.png,Furniture!row 3,',
            'I3,import,L2,Rug,I3.png,Furniture!row 4,',
            'I4,import,L2,Rug,I4.jpg,Furniture!row 4,',
            'I5,import,L3,Faux tree,I5.png,Furniture!row 8,',
            'I6,import,L4,,I6.png,,',
          ]),
        ),
      );
      const plan = await planImages(tx, images, lines);
      expect(plan.skipped.map((s) => s.id)).toEqual(['I1']);
      expect(plan.unmatched).toEqual([
        'I5: no shopping line "Faux tree" in the whole house (renamed or removed?)',
        "I6: L4 isn't a shopping line in the lines file",
      ]);
      expect(plan.attach.get(couch.id)?.images.map((i) => i.id)).toEqual(['I2']);
      expect(plan.attach.get(rug.id)?.images.map((i) => i.id)).toEqual(['I3', 'I4']);

      const storage = createFakeStorage();
      const member = await importingMember(tx);
      const read = (name: string) => new Uint8Array(name.endsWith('.jpg') ? 20 : 10);
      expect(await attachImages(tx, storage, plan, read, member)).toBe(3);

      const rugFiles = await listManyFiles(tx, storage, {
        ownerType: 'shopping_line',
        ownerIds: [rug.id],
      });
      // Newest first is the sheet's first picture, so it's the one shown in the row. Upload
      // times are one instant inside this transaction, so check by insertion order instead.
      const rows = await tx.select().from(files).where(eq(files.ownerId, rug.id));
      expect(rows.map((f) => f.originalName)).toEqual(['I4.jpg', 'I3.png']);
      expect(rugFiles.every((f) => f.kind === 'product_image' && f.url)).toBe(true);
      expect(rows.find((f) => f.originalName === 'I4.jpg')?.mimeType).toBe('image/jpeg');

      const again = await planImages(tx, images, lines);
      expect(again.attach.size).toBe(0);
      expect(again.alreadyHas.sort()).toEqual(['Couch', 'rug']);
    }));
});
