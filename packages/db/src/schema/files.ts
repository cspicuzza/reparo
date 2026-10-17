import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uuid,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { id, softDelete, timestamps } from './columns';
import { jobs } from './jobs';
import { members } from './members';

/** What an upload is for. Drives which Storage bucket it lives in and where it's shown. */
export const fileKind = pgEnum('file_kind', [
  'mockup',
  'spec_drawing',
  'receipt',
  'quote',
  'vendor_document',
  'other',
  // Model fix: room pictures and product images.
  'rendering',
  'inspiration',
  'progress_photo',
  'product_image',
  // M4 (OD-54): a job's contract, permit, invoices and lien waivers.
  'paperwork',
]);
export type FileKind = (typeof fileKind.enumValues)[number];

/** Which record an upload belongs to. Extended as milestones add tables. */
export const fileOwnerType = pgEnum('file_owner_type', [
  'job',
  'cost',
  'vendor',
  'quote',
  'room',
  'purchase',
  // M4 (OD-54). `cost`, `quote` and `purchase` predate their tables and stay unused.
  'shopping_line',
  'payment',
  'estimate',
]);
export type FileOwnerType = (typeof fileOwnerType.enumValues)[number];

/** One row per uploaded object in Supabase Storage. Bytes never live in Postgres. */
export const files = pgTable(
  'files',
  {
    id: id(),
    kind: fileKind('kind').notNull(),
    bucket: text('bucket').notNull(),
    /**
     * Object path inside the bucket. Unique per bucket, removed files included (OD-163): a
     * removed file's object stays in storage, so its path is never recorded again.
     */
    path: text('path').notNull(),
    /**
     * Pictures: a small JPEG made in the browser at upload (640px on the longest side), shown
     * in lists and tiles; the original stays for the viewer. Null for files and for pictures
     * from before thumbnails, which show the original (OD-115, Q136; Q169–Q171).
     */
    thumbPath: text('thumb_path'),
    /**
     * Pictures: a smaller JPEG (160px on the longest side) for the smallest tiles, such as a
     * shopping row's picture and a room's card, so a long list doesn't load 640px pictures to
     * show them at 56px. Null when there's none yet; those tiles then use the thumbnail
     * (OD-141, Q208).
     */
    tinyPath: text('tiny_path'),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    originalName: text('original_name').notNull(),
    ownerType: fileOwnerType('owner_type').notNull(),
    ownerId: uuid('owner_id').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Optional words under the picture ("Option B: darker grout"). */
    caption: text('caption').notNull().default(''),
    /** Progress photos: the day it was taken (defaults to the upload day, can be changed). */
    takenOn: date('taken_on', { mode: 'string' }),
    /**
     * Progress photos only: the job the photo shows ("tile going in"), so it appears on that
     * job's page too. The lambda's return type breaks the files → jobs → rooms → files cycle.
     */
    jobId: uuid('job_id').references((): AnyPgColumn => jobs.id, { onDelete: 'restrict' }),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('files_owner_idx').on(t.ownerType, t.ownerId),
    // Full, not partial (db.md's soft-delete rule): removed files keep their stored object, so
    // their paths stay taken; it also serves finishUpload's lookup, which counts them (OD-163).
    uniqueIndex('files_bucket_path_uidx').on(t.bucket, t.path),
    index('files_job_idx').on(t.jobId),
    // Compared as text: on a fresh database every migration runs in one transaction, and
    // Postgres refuses enum literals added by ALTER TYPE earlier in that transaction (55P04).
    check('files_job_ck', sql`${t.jobId} IS NULL OR ${t.kind}::text = 'progress_photo'`),
    check('files_size_ck', sql`${t.sizeBytes} >= 0`),
  ],
);

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
