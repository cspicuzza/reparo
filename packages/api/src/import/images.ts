import {
  and,
  asc,
  eq,
  files,
  inArray,
  isNull,
  members,
  rooms,
  shoppingLines,
  type Db,
} from '@reparo/db';
import { importImageSchema, type ImportImage, type ImportLine } from '@reparo/shared';
import type { Storage } from '../storage/storage';
import { finishUpload, startUpload } from '../services/files';
import { ImportProblem } from './run';

// The spreadsheet's product images (OD-61; M4 grilling Q23). Claude read the Furniture sheet's
// 67 pictures once into `import/images/` with a list, `import/spreadsheet-images.csv`, naming
// the lines-file line each belongs to. This attaches them to the shopping lines OD-36 made,
// through the same upload services the app uses. `raw/` is never read here.

/** Check every row of the image list first; report all problems at once, by id. */
export function validateImages(records: Record<string, string>[]): ImportImage[] {
  const problems: string[] = [];
  const rows: ImportImage[] = [];
  records.forEach((rec, i) => {
    const parsed = importImageSchema.safeParse(rec);
    if (parsed.success) rows.push(parsed.data);
    else {
      const where = rec['id'] || `row ${i + 2}`;
      for (const issue of parsed.error.issues) {
        problems.push(`${where} ${issue.path.join('.')}: ${issue.message}`);
      }
    }
  });
  if (problems.length > 0)
    throw new ImportProblem(`The image list has problems:\n${problems.join('\n')}`);
  return rows;
}

const key = (s: string) => s.trim().toLowerCase().replace(/’/g, "'");

export type ImagePlan = {
  /** Shopping line id → the pictures to attach, in the spreadsheet's order. */
  attach: Map<string, { lineName: string; images: ImportImage[] }>;
  /** Lines that already have pictures: left alone, so a second run adds nothing. */
  alreadyHas: string[];
  /** Rows that couldn't be matched to a live shopping line, with why. */
  unmatched: string[];
  /** `skip` rows (the heading-row pictures until they're placed). */
  skipped: ImportImage[];
};

/**
 * Match each picture to a live shopping line: the lines-file line it names, found by name and
 * room (whole house when the line has none), ignoring case. Prices aren't compared, so lines
 * whose price was fixed after the import still match; a renamed line is reported instead.
 */
export async function planImages(
  db: Db,
  images: ImportImage[],
  lines: ImportLine[],
): Promise<ImagePlan> {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const live = await db
    .select({ id: shoppingLines.id, name: shoppingLines.name, room: rooms.name })
    .from(shoppingLines)
    .leftJoin(rooms, eq(rooms.id, shoppingLines.roomId))
    .where(isNull(shoppingLines.deletedAt))
    .orderBy(asc(shoppingLines.createdAt));
  const plan: ImagePlan = { attach: new Map(), alreadyHas: [], unmatched: [], skipped: [] };

  for (const img of images) {
    if (img.action === 'skip') {
      plan.skipped.push(img);
      continue;
    }
    const line = byId.get(img.line_id);
    if (!line || line.kind !== 'shopping') {
      plan.unmatched.push(`${img.id}: ${img.line_id} isn't a shopping line in the lines file`);
      continue;
    }
    const found = live.filter(
      (s) => key(s.name) === key(line.name) && key(s.room ?? '') === key(line.room),
    );
    if (found.length !== 1) {
      const where = line.room || 'the whole house';
      plan.unmatched.push(
        found.length === 0
          ? `${img.id}: no shopping line "${line.name}" in ${where} (renamed or removed?)`
          : `${img.id}: ${found.length} shopping lines "${line.name}" in ${where}; can't tell which`,
      );
      continue;
    }
    const target = found[0];
    if (!target) continue;
    const entry = plan.attach.get(target.id) ?? { lineName: target.name, images: [] };
    entry.images.push(img);
    plan.attach.set(target.id, entry);
  }

  if (plan.attach.size > 0) {
    const has = await db
      .selectDistinct({ ownerId: files.ownerId })
      .from(files)
      .where(
        and(
          eq(files.ownerType, 'shopping_line'),
          eq(files.kind, 'product_image'),
          inArray(files.ownerId, [...plan.attach.keys()]),
          isNull(files.deletedAt),
        ),
      );
    for (const { ownerId } of has) {
      const name = plan.attach.get(ownerId)?.lineName ?? ownerId;
      plan.alreadyHas.push(name);
      plan.attach.delete(ownerId);
    }
  }
  return plan;
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** The admin who uploads them (the first admin on the household list). */
export async function importingMember(db: Db): Promise<string> {
  const [admin] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.role, 'admin'))
    .orderBy(asc(members.createdAt))
    .limit(1);
  if (!admin) throw new ImportProblem('No admin on the household list to record the uploads as');
  return admin.id;
}

/**
 * Upload and record the planned pictures. A line's pictures go up last-first, so the
 * spreadsheet's first picture is the newest and shows in the line's row. Returns how many were
 * attached. Each picture is its own upload: if the run stops part-way, running it again
 * skips the lines that already have pictures.
 */
export async function attachImages(
  db: Db,
  storage: Storage,
  plan: ImagePlan,
  readImage: (name: string) => Uint8Array,
  memberId: string,
  onProgress: (done: number) => void = () => {},
): Promise<number> {
  let done = 0;
  for (const [lineId, { images }] of plan.attach) {
    for (const img of [...images].reverse()) {
      const ext = img.image.split('.').pop()?.toLowerCase() ?? '';
      const mimeType = MIME[ext];
      if (!mimeType) throw new ImportProblem(`${img.id}: ${img.image} isn't a PNG, JPEG or WebP`);
      const bytes = readImage(img.image);
      const base = {
        ownerType: 'shopping_line' as const,
        ownerId: lineId,
        kind: 'product_image' as const,
        originalName: img.image,
        mimeType,
        sizeBytes: bytes.byteLength,
      };
      const { path, uploadUrl } = await startUpload(db, storage, base);
      await storage.putBytes(uploadUrl, bytes, mimeType);
      await finishUpload(db, storage, memberId, {
        ...base,
        path,
        caption: '',
        takenOn: null,
        jobId: null,
        // The server can't shrink pictures; the admin's backfill in Manage makes these (Q170).
        thumbPath: null,
      });
      done += 1;
      onProgress(done);
    }
  }
  return done;
}
