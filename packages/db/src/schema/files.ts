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
    /** Object path inside the bucket. Unique per bucket. */
    path: text('path').notNull(),
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
    index('files_bucket_path_idx').on(t.bucket, t.path),
    index('files_job_idx').on(t.jobId),
    // Compared as text: on a fresh database every migration runs in one transaction, and
    // Postgres refuses enum literals added by ALTER TYPE earlier in that transaction (55P04).
    check('files_job_ck', sql`${t.jobId} IS NULL OR ${t.kind}::text = 'progress_photo'`),
    check('files_size_ck', sql`${t.sizeBytes} >= 0`),
  ],
);

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
