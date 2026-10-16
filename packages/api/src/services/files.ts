import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  inArray,
  desc,
  eq,
  estimates,
  files,
  isNull,
  jobRooms,
  jobs,
  payments,
  rooms,
  shoppingLines,
  sql,
  vendors,
  type Db,
  type File,
} from '@reparo/db';
import {
  FILE_KINDS_BY_OWNER,
  fileProblem,
  PICTURE_KINDS,
  THUMB_MAX_BYTES,
  today,
  type FileFinish,
  type FileKindInput,
  type FileOwner,
  type FileOwnerRef,
  type FileOwnerRefs,
  type FileStart,
  type FileThumb,
  type FileUpdate,
  type RoomCover,
} from '@reparo/shared';
import type { Storage } from '../storage/storage';
import { badRequest, conflict, notFound } from './errors';

// Files (M4, OD-55; Linear *Data model* doc → M4 → Files). The bytes never pass through the
// API: the browser asks for an upload link (`startUpload`), PUTs the file straight to storage
// (Vercel caps a request body at 4.5 MB), then asks us to record it (`finishUpload`), which
// checks what actually arrived. Viewing is by short-lived signed links, so a forwarded link
// stops working.

/** How long a view link lasts. Lists are refetched well within it. */
export const VIEW_SECONDS = 60 * 60;

const live = () => isNull(files.deletedAt);

const EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** `room/<uuid>/<uuid>.jpg`: the owner is in the path, so a finish can't be pointed elsewhere. */
function pathFor(owner: FileOwner, ownerId: string, mimeType: string): string {
  return `${owner}/${ownerId}/${randomUUID()}.${EXTENSION[mimeType] ?? 'bin'}`;
}

const PATH_RE = /^([a-z_]+)\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/;

/** A picture's thumbnail sits beside it under its own id: `room/<uuid>/<uuid>.thumb.jpg`. */
function thumbPathFor(owner: string, ownerId: string): string {
  return `${owner}/${ownerId}/${randomUUID()}.thumb.jpg`;
}

const THUMB_RE = /^([a-z_]+)\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.thumb\.jpg$/;

/**
 * The thumbnail path to record, or null (OD-115, Q169): it has to sit beside this owner's
 * files and storage has to hold a small JPEG there. A bad or missing thumbnail never fails the
 * upload itself; the original is shown instead.
 */
async function checkedThumb(
  storage: Storage,
  owner: string,
  ownerId: string,
  thumbPath: string | null,
): Promise<string | null> {
  if (!thumbPath) return null;
  const m = THUMB_RE.exec(thumbPath);
  if (!m || m[1] !== owner || m[2] !== ownerId) return null;
  const stored = await storage.stat(thumbPath);
  if (!stored || stored.mimeType !== 'image/jpeg') return null;
  if (stored.sizeBytes <= 0 || stored.sizeBytes > THUMB_MAX_BYTES) return null;
  return thumbPath;
}

function assertKind(owner: FileOwner, kind: FileKindInput) {
  const kinds: readonly FileKindInput[] = FILE_KINDS_BY_OWNER[owner];
  if (!kinds.includes(kind))
    throw badRequest(`A ${owner.replace('_', ' ')} can't hold that kind of file`);
}

/** The owner must be a live row. Estimates arrive with OD-62. */
async function assertOwner(db: Db, owner: FileOwner, id: string): Promise<void> {
  const one = async (rows: Promise<unknown[]>, what: string) => {
    if ((await rows).length === 0) throw notFound(what);
  };
  switch (owner) {
    case 'room':
      return one(
        db
          .select({ id: rooms.id })
          .from(rooms)
          .where(and(eq(rooms.id, id), isNull(rooms.deletedAt))),
        'Room',
      );
    case 'job':
      return one(
        db
          .select({ id: jobs.id })
          .from(jobs)
          .where(and(eq(jobs.id, id), isNull(jobs.deletedAt))),
        'Job',
      );
    case 'payment':
      return one(
        db
          .select({ id: payments.id })
          .from(payments)
          .where(and(eq(payments.id, id), isNull(payments.deletedAt))),
        'Payment',
      );
    case 'shopping_line':
      return one(
        db
          .select({ id: shoppingLines.id })
          .from(shoppingLines)
          .where(and(eq(shoppingLines.id, id), isNull(shoppingLines.deletedAt))),
        'Shopping line',
      );
    case 'vendor':
      return one(
        db
          .select({ id: vendors.id })
          .from(vendors)
          .where(and(eq(vendors.id, id), isNull(vendors.deletedAt))),
        'Vendor',
      );
    case 'estimate':
      return one(
        db
          .select({ id: estimates.id })
          .from(estimates)
          .where(and(eq(estimates.id, id), isNull(estimates.deletedAt))),
        'Estimate',
      );
  }
}

/** A progress photo's job must be a live job that covers the photo's room. */
async function assertJobCoversRoom(db: Db, jobId: string, roomId: string): Promise<void> {
  const rows = await db
    .select({ id: jobRooms.id })
    .from(jobRooms)
    .innerJoin(jobs, eq(jobs.id, jobRooms.jobId))
    .where(
      and(
        eq(jobRooms.jobId, jobId),
        eq(jobRooms.roomId, roomId),
        isNull(jobRooms.deletedAt),
        isNull(jobs.deletedAt),
      ),
    );
  if (rows.length === 0) throw badRequest('That job doesn’t cover this room');
}

/** Step 1: check everything we can before the bytes move, and hand back an upload link. */
export async function startUpload(db: Db, storage: Storage, input: FileStart) {
  assertKind(input.ownerType, input.kind);
  const problem = fileProblem(input.kind, input.mimeType, input.sizeBytes);
  if (problem) throw badRequest(problem);
  await assertOwner(db, input.ownerType, input.ownerId);
  const path = pathFor(input.ownerType, input.ownerId, input.mimeType);
  const { url } = await storage.createUploadUrl(path);
  if (!PICTURE_KINDS.includes(input.kind)) {
    return { path, uploadUrl: url, thumbPath: null, thumbUploadUrl: null };
  }
  // Pictures also get a link for the small JPEG the browser makes (OD-115, Q169).
  const thumbPath = thumbPathFor(input.ownerType, input.ownerId);
  const thumb = await storage.createUploadUrl(thumbPath);
  return { path, uploadUrl: url, thumbPath, thumbUploadUrl: thumb.url };
}

/** Step 3: record the file, going by what storage actually holds (size and type). */
export async function finishUpload(db: Db, storage: Storage, memberId: string, input: FileFinish) {
  assertKind(input.ownerType, input.kind);
  await assertOwner(db, input.ownerType, input.ownerId);
  const m = PATH_RE.exec(input.path);
  if (!m || m[1] !== input.ownerType || m[2] !== input.ownerId) {
    throw badRequest('That upload doesn’t belong here');
  }
  const stored = await storage.stat(input.path);
  if (!stored) throw badRequest('The file didn’t arrive. Try again.');
  const problem = fileProblem(input.kind, stored.mimeType, stored.sizeBytes);
  if (problem) throw badRequest(problem);

  const progress = input.kind === 'progress_photo';
  if (progress && input.jobId) await assertJobCoversRoom(db, input.jobId, input.ownerId);

  const existing = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.bucket, storage.bucket), eq(files.path, input.path)));
  if (existing.length > 0) throw conflict('That file is already saved');
  const thumbPath = PICTURE_KINDS.includes(input.kind)
    ? await checkedThumb(storage, input.ownerType, input.ownerId, input.thumbPath)
    : null;

  const [row] = await db
    .insert(files)
    .values({
      kind: input.kind,
      bucket: storage.bucket,
      path: input.path,
      thumbPath,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      originalName: input.originalName,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      caption: input.caption,
      takenOn: progress ? (input.takenOn ?? today()) : null,
      jobId: progress ? input.jobId : null,
      uploadedBy: memberId,
    })
    .returning();
  if (!row) throw new Error('insert returned no row');
  const [view] = await withUrls(storage, [{ file: row, jobName: null }], null);
  if (!view) throw new Error('no view for the new file');
  return view;
}

type Row = { file: File; jobName: string | null };

/**
 * What the web gets for each file: the row's useful fields plus short-lived view links for the
 * file and, for pictures, its thumbnail. Both are signed in the same storage call.
 */
async function withUrls(storage: Storage, rows: Row[], coverId: string | null) {
  const urls = await storage.createViewUrls(
    rows.flatMap((r) => (r.file.thumbPath ? [r.file.path, r.file.thumbPath] : [r.file.path])),
    VIEW_SECONDS,
  );
  return rows.map(({ file: f, jobName }) => ({
    id: f.id,
    kind: f.kind,
    ownerType: f.ownerType,
    ownerId: f.ownerId,
    originalName: f.originalName,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    caption: f.caption,
    takenOn: f.takenOn,
    jobId: f.jobId,
    jobName,
    createdAt: f.createdAt,
    isPicture: f.mimeType.startsWith('image/'),
    isCover: f.id === coverId,
    /** Null when storage no longer has the object; the web shows a "missing" tile. */
    url: urls.get(f.path) ?? null,
    /** The small JPEG for lists and tiles; null when there's none, so lists use `url`. */
    thumbUrl: f.thumbPath ? (urls.get(f.thumbPath) ?? null) : null,
  }));
}

export type FileView = Awaited<ReturnType<typeof withUrls>>[number];

async function roomCover(db: Db, roomId: string): Promise<string | null> {
  const [r] = await db.select({ cover: rooms.coverFileId }).from(rooms).where(eq(rooms.id, roomId));
  return r?.cover ?? null;
}

/** An owner's live files: newest first, a room's cover first. */
export async function listFiles(db: Db, storage: Storage, { ownerType, ownerId }: FileOwnerRef) {
  const coverId = ownerType === 'room' ? await roomCover(db, ownerId) : null;
  const rows = await db
    .select({ file: files, jobName: jobs.name })
    .from(files)
    .leftJoin(jobs, and(eq(jobs.id, files.jobId), isNull(jobs.deletedAt)))
    .where(and(eq(files.ownerType, ownerType), eq(files.ownerId, ownerId), live()))
    .orderBy(
      ...(coverId ? [desc(sql`${files.id} = ${coverId}`)] : []),
      desc(files.createdAt),
      asc(files.id),
    );
  return withUrls(storage, rows, coverId);
}

async function getLive(db: Db, id: string): Promise<File> {
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), live()));
  if (!row) throw notFound('File');
  return row;
}

/** Caption on any file; date and job on progress photos only. */
export async function updateFile(db: Db, input: FileUpdate) {
  const f = await getLive(db, input.id);
  const progress = f.kind === 'progress_photo';
  if (!progress && (input.takenOn !== undefined || input.jobId !== undefined)) {
    throw badRequest('Only progress photos have a date and a job');
  }
  if (progress && input.jobId) await assertJobCoversRoom(db, input.jobId, f.ownerId);
  const set: Partial<File> = {};
  if (input.caption !== undefined) set.caption = input.caption;
  if (input.takenOn !== undefined) set.takenOn = input.takenOn;
  if (input.jobId !== undefined) set.jobId = input.jobId;
  if (Object.keys(set).length === 0) return f;
  const [row] = await db.update(files).set(set).where(eq(files.id, f.id)).returning();
  return row ?? f;
}

/** Soft delete (Q10: no restore screen). A removed cover stops being the cover. */
export async function removeFile(db: Db, id: string) {
  const f = await getLive(db, id);
  await db.update(rooms).set({ coverFileId: null }).where(eq(rooms.coverFileId, f.id));
  const [row] = await db
    .update(files)
    .set({ deletedAt: new Date() })
    .where(eq(files.id, f.id))
    .returning();
  return row;
}

/** A room's cover is one of its own live renderings, or none (Q16). */
export async function setRoomCover(db: Db, { roomId, fileId }: RoomCover) {
  await assertOwner(db, 'room', roomId);
  if (fileId) {
    const f = await getLive(db, fileId);
    if (f.ownerType !== 'room' || f.ownerId !== roomId || f.kind !== 'rendering') {
      throw badRequest('The cover has to be one of this room’s renderings');
    }
  }
  const [row] = await db
    .update(rooms)
    .set({ coverFileId: fileId })
    .where(eq(rooms.id, roomId))
    .returning();
  return row;
}

/** Each room's cover picture link, for the Rooms list (Q16). Rooms without one are absent. */
export async function listRoomCovers(db: Db, storage: Storage) {
  const rows = await db
    .select({
      roomId: rooms.id,
      fileId: files.id,
      path: files.path,
      thumbPath: files.thumbPath,
      caption: files.caption,
    })
    .from(rooms)
    .innerJoin(files, and(eq(files.id, rooms.coverFileId), live()))
    .where(isNull(rooms.deletedAt));
  const urls = await storage.createViewUrls(
    rows.flatMap((r) => (r.thumbPath ? [r.path, r.thumbPath] : [r.path])),
    VIEW_SECONDS,
  );
  return rows.flatMap((r) => {
    const url = urls.get(r.path);
    // Covers are only ever shown small, so the thumbnail is the link when there is one.
    const thumb = r.thumbPath ? urls.get(r.thumbPath) : null;
    return url ? [{ roomId: r.roomId, id: r.fileId, url: thumb ?? url, caption: r.caption }] : [];
  });
}

/** Files of many owners of one type in one go: newest first within each owner. */
export async function listManyFiles(
  db: Db,
  storage: Storage,
  { ownerType, ownerIds }: FileOwnerRefs,
) {
  if (ownerIds.length === 0) return [];
  const rows = await db
    .select({ file: files, jobName: sql<string | null>`null` })
    .from(files)
    .where(and(eq(files.ownerType, ownerType), inArray(files.ownerId, ownerIds), live()))
    .orderBy(desc(files.createdAt), asc(files.id));
  return withUrls(storage, rows, null);
}

/** Progress photos that show this job, from every room it covers (Q17), newest first. */
export async function listJobProgressPhotos(db: Db, storage: Storage, jobId: string) {
  const rows = await db
    .select({ file: files, jobName: jobs.name, roomName: rooms.name })
    .from(files)
    .innerJoin(jobs, eq(jobs.id, files.jobId))
    .innerJoin(rooms, and(eq(rooms.id, files.ownerId), isNull(rooms.deletedAt)))
    .where(and(eq(files.jobId, jobId), eq(files.kind, 'progress_photo'), live()))
    .orderBy(desc(files.takenOn), desc(files.createdAt), asc(files.id));
  const views = await withUrls(storage, rows, null);
  return views.map((v, i) => ({ ...v, roomName: rows[i]?.roomName ?? '' }));
}

/**
 * Pictures that have no thumbnail yet, oldest first, with a link to the original so the
 * admin's browser can make one (the backfill in Manage; OD-115, Q170).
 */
export async function listPicturesWithoutThumbs(db: Db, storage: Storage) {
  const rows = await db
    .select({ file: files, jobName: sql<string | null>`null` })
    .from(files)
    .where(
      and(
        live(),
        isNull(files.thumbPath),
        inArray(files.kind, [...PICTURE_KINDS]),
        sql`${files.mimeType} like 'image/%'`,
      ),
    )
    .orderBy(asc(files.createdAt), asc(files.id));
  return withUrls(storage, rows, null);
}

/** A link for one picture's thumbnail, made later (Q170). */
export async function startThumb(db: Db, storage: Storage, id: string) {
  const f = await getLive(db, id);
  if (!PICTURE_KINDS.includes(f.kind)) throw badRequest('Only pictures get a thumbnail');
  const thumbPath = thumbPathFor(f.ownerType, f.ownerId);
  const { url } = await storage.createUploadUrl(thumbPath);
  return { thumbPath, uploadUrl: url };
}

/** Record a thumbnail made later, once storage holds it (Q170). */
export async function finishThumb(db: Db, storage: Storage, { id, thumbPath }: FileThumb) {
  const f = await getLive(db, id);
  const checked = await checkedThumb(storage, f.ownerType, f.ownerId, thumbPath);
  if (!checked) throw badRequest('The thumbnail didn’t arrive. Try again.');
  const [row] = await db
    .update(files)
    .set({ thumbPath: checked })
    .where(eq(files.id, f.id))
    .returning();
  return { id: row?.id ?? f.id, thumbPath: checked };
}
