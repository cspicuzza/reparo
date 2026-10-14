import { bigint, index, pgEnum, pgTable, text, uuid, integer } from 'drizzle-orm/pg-core';
import { id, softDelete, timestamps } from './columns';
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
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('files_owner_idx').on(t.ownerType, t.ownerId),
    index('files_bucket_path_idx').on(t.bucket, t.path),
  ],
);

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
