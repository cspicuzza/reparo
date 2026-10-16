// Input schemas shared by the API (tRPC inputs) and the web forms (zodResolver), so both
// validate the same way. Output types are what the API
// stores: inches as numbers, dates as ISO strings, names trimmed.

import { z } from 'zod';
import { isIsoDate } from './date';
import { parseLength, snapInches } from './length';
import { cents } from './money';

export const PHASE_STATUSES = ['planned', 'active', 'complete'] as const;
export type PhaseStatusInput = (typeof PHASE_STATUSES)[number];

/** `awaiting_review` = the work is done and someone still has to verify it's good. */
export const WORK_STATUSES = [
  'unstarted',
  'in_progress',
  'awaiting_review',
  'completed',
  'cancelled',
] as const;
export type WorkStatusInput = (typeof WORK_STATUSES)[number];

/** Mirrors `shopping_status` in `@reparo/db`: To buy → Purchased → Returned (M3). */
export const SHOPPING_STATUSES = ['to_buy', 'purchased', 'returned'] as const;
/** Mirrors `estimate_status` in `@reparo/db` (M4). */
export const ESTIMATE_STATUSES = ['requested', 'received', 'chosen', 'declined'] as const;
export type EstimateStatusInput = (typeof ESTIMATE_STATUSES)[number];
export type ShoppingStatusInput = (typeof SHOPPING_STATUSES)[number];

export const idSchema = z.uuid({ error: 'id must be a UUID' });
// Messages are shown to the household as they are, so they say what to do (Design system → Writing).
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Give it a name')
  .max(120, 'Keep the name under 120 characters');
export const notesSchema = z.string().max(10_000, 'Keep this under 10,000 characters');
const WHOLE_NUMBER = 'Enter a whole number, 0 or more';
export const sortOrderSchema = z
  .number({ error: WHOLE_NUMBER })
  .int(WHOLE_NUMBER)
  .min(0, WHOLE_NUMBER);

/** `YYYY-MM-DD` or null. Rejects impossible dates (ADR-004). */
export const isoDateSchema = z
  .string()
  .trim()
  .refine(isIsoDate, { error: 'Enter a date like 2026-10-14' });

/**
 * A length as a person types it (`7' 3 1/2"`, `87.5`, `3/4"`) or already in inches; empty
 * means not measured. Output is inches snapped to 1/16" (ADR-011) or null.
 */
export const LENGTH_HELP = `Write it in feet and inches, like 14' 6 1/2", or inches, like 174.5`;

export const lengthSchema = z
  .union([z.string(), z.number(), z.null()])
  .transform((v, ctx): number | null => {
    if (v === null) return null;
    try {
      if (typeof v === 'number') return snapInches(v, 'length');
      if (v.trim() === '') return null;
      return parseLength(v);
    } catch {
      ctx.addIssue({ code: 'custom', message: LENGTH_HELP });
      return z.NEVER;
    }
  });

// --- phases ---------------------------------------------------------------------------------

const phaseFields = {
  name: nameSchema,
  status: z.enum(PHASE_STATUSES),
  startsOn: isoDateSchema.nullable(),
  endsOn: isoDateSchema.nullable(),
  notes: notesSchema,
  sortOrder: sortOrderSchema,
};

export const phaseCreateSchema = z.object({
  ...phaseFields,
  status: phaseFields.status.default('planned'),
  startsOn: phaseFields.startsOn.default(null),
  endsOn: phaseFields.endsOn.default(null),
  notes: phaseFields.notes.default(''),
  sortOrder: phaseFields.sortOrder.default(0),
});
export const phaseUpdateSchema = z.object(phaseFields).partial().extend({ id: idSchema });
export type PhaseCreate = z.infer<typeof phaseCreateSchema>;
export type PhaseUpdate = z.infer<typeof phaseUpdateSchema>;

// --- rooms ----------------------------------------------------------------------------------

const roomFields = {
  name: nameSchema,
  lengthIn: lengthSchema,
  widthIn: lengthSchema,
  ceilingHeightIn: lengthSchema,
  notes: notesSchema,
  sortOrder: sortOrderSchema,
};

/** On create an omitted measurement is "not measured" (null). */
const optionalLength = lengthSchema.optional().transform((v) => v ?? null);

export const roomCreateSchema = z.object({
  ...roomFields,
  lengthIn: optionalLength,
  widthIn: optionalLength,
  ceilingHeightIn: optionalLength,
  notes: roomFields.notes.default(''),
  sortOrder: roomFields.sortOrder.default(0),
});
export const roomUpdateSchema = z.object(roomFields).partial().extend({ id: idSchema });
export type RoomCreate = z.infer<typeof roomCreateSchema>;
export type RoomUpdate = z.infer<typeof roomUpdateSchema>;
/** What a room form holds before parsing: lengths as typed text. */
export type RoomCreateInput = z.input<typeof roomCreateSchema>;

// --- vendors (M2) ----------------------------------------------------------------------------

/** Free-text contact fields: blank is fine, so the household can add a vendor with just a name. */
const shortTextSchema = (max: number, what: string) =>
  z.string().trim().max(max, `Keep the ${what} under ${max} characters`);

const vendorFields = {
  name: nameSchema,
  /** What they do ("Plumber", "Demo crew"). Free text; there is no trade list. */
  trade: shortTextSchema(120, 'trade'),
  phone: shortTextSchema(40, 'phone number'),
  email: z.union([
    z.literal(''),
    z
      .string()
      .trim()
      .pipe(z.email({ error: 'Enter an email like name@example.com' })),
  ]),
  notes: notesSchema,
};

export const vendorCreateSchema = z.object({
  name: vendorFields.name,
  trade: vendorFields.trade.default(''),
  phone: vendorFields.phone.default(''),
  email: vendorFields.email.default(''),
  notes: vendorFields.notes.default(''),
});
export const vendorUpdateSchema = z.object(vendorFields).partial().extend({ id: idSchema });
/** `query` matches the name or trade; archived vendors are left out unless asked for. */
export const vendorListSchema = z.object({
  query: z.string().trim().max(120).default(''),
  includeArchived: z.boolean().default(false),
});
export type VendorCreate = z.infer<typeof vendorCreateSchema>;
export type VendorCreateInput = z.input<typeof vendorCreateSchema>;
export type VendorUpdate = z.infer<typeof vendorUpdateSchema>;
export type VendorList = z.infer<typeof vendorListSchema>;

// --- jobs (Model fix) ------------------------------------------------------------------------

/** Mirrors `file_kind` / `file_owner_type` in `@reparo/db`. Uploads arrive in M4. */
export const FILE_KINDS = [
  'mockup',
  'spec_drawing',
  'receipt',
  'quote',
  'vendor_document',
  'other',
  'rendering',
  'inspiration',
  'progress_photo',
  'product_image',
  // M4 (OD-54): a job's contract, permit, invoices and lien waivers.
  'paperwork',
] as const;
export type FileKindInput = (typeof FILE_KINDS)[number];
export const FILE_OWNER_TYPES = [
  'job',
  'cost',
  'vendor',
  'quote',
  'room',
  'purchase',
  // M4 (OD-54). `cost`, `quote` and `purchase` were placeholders before those tables existed;
  // enum values are never removed (db.md), so they stay unused.
  'shopping_line',
  'payment',
  'estimate',
] as const;
export type FileOwnerTypeInput = (typeof FILE_OWNER_TYPES)[number];

// --- files (M4, OD-55) -----------------------------------------------------------------------

/** What can be uploaded (Q6). HEIC is left out on purpose: iPhones hand over a JPEG (Q8). */
export const FILE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type FileMimeType = (typeof FILE_MIME_TYPES)[number];
export const IMAGE_MIME_TYPES: readonly FileMimeType[] = ['image/jpeg', 'image/png', 'image/webp'];
/** 50 MB, the local Supabase limit (Q6). */
export const FILE_MAX_BYTES = 50 * 1024 * 1024;

/** The owners that take files in M4, and the kinds each one holds (Data model doc → M4). */
export const FILE_KINDS_BY_OWNER = {
  room: ['rendering', 'inspiration', 'progress_photo'],
  job: ['mockup', 'spec_drawing', 'paperwork'],
  payment: ['receipt'],
  shopping_line: ['product_image', 'receipt'],
  vendor: ['vendor_document'],
  estimate: ['quote'],
} as const satisfies Partial<Record<FileOwnerTypeInput, readonly FileKindInput[]>>;
export type FileOwner = keyof typeof FILE_KINDS_BY_OWNER;
export const FILE_OWNERS = Object.keys(FILE_KINDS_BY_OWNER) as FileOwner[];

/** Kinds that are pictures only. Everything else also takes a PDF (a quote, a receipt scan). */
export const PICTURE_KINDS: readonly FileKindInput[] = [
  'rendering',
  'inspiration',
  'progress_photo',
  'product_image',
];

/** The plain-words reason a file can't go here, or null when it can. */
export function fileProblem(
  kind: FileKindInput,
  mimeType: string,
  sizeBytes: number,
): string | null {
  const allowed: readonly string[] = PICTURE_KINDS.includes(kind)
    ? IMAGE_MIME_TYPES
    : FILE_MIME_TYPES;
  if (!allowed.includes(mimeType)) {
    return PICTURE_KINDS.includes(kind)
      ? 'Pictures need to be JPEG, PNG or WebP'
      : 'Files need to be a PDF, JPEG, PNG or WebP';
  }
  if (sizeBytes > FILE_MAX_BYTES) return 'That file is over 50 MB';
  if (sizeBytes <= 0) return 'That file is empty';
  return null;
}

const fileOwnerSchema = z.enum(FILE_OWNERS as [FileOwner, ...FileOwner[]]);
export const captionSchema = z.string().trim().max(500, 'Keep the caption under 500 characters');

export const fileListSchema = z.object({ ownerType: fileOwnerSchema, ownerId: idSchema });
export type FileOwnerRef = z.infer<typeof fileListSchema>;
/** Files of many owners of one type at once (a job's payments, the shopping list's lines). */
export const fileListManySchema = z.object({
  ownerType: fileOwnerSchema,
  ownerIds: z.array(idSchema).max(1000),
});
export type FileOwnerRefs = z.infer<typeof fileListManySchema>;

/** Ask for a place to upload one file. The browser then sends the bytes straight to storage. */
export const fileStartSchema = z.object({
  ownerType: fileOwnerSchema,
  ownerId: idSchema,
  kind: z.enum(FILE_KINDS),
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(0),
});
export type FileStart = z.infer<typeof fileStartSchema>;

/** Record the file once its bytes are in storage. */
export const fileFinishSchema = fileStartSchema.extend({
  path: z.string().min(1).max(500),
  caption: captionSchema.default(''),
  /** Progress photos: the day taken. The browser sends its own today by default. */
  takenOn: isoDateSchema.nullable().default(null),
  /** Progress photos: the job the photo shows. */
  jobId: idSchema.nullable().default(null),
  /**
   * Pictures: where the browser put the small JPEG it made (from `uploadLink`), or null when
   * it couldn't make one; the original is shown then (OD-115, Q169).
   */
  thumbPath: z.string().min(1).max(500).nullable().default(null),
});
export type FileFinish = z.infer<typeof fileFinishSchema>;

/** A thumbnail made later for a picture that has none (the backfill in Manage, Q170). */
export const fileThumbSchema = z.object({ id: idSchema, thumbPath: z.string().min(1).max(500) });
export type FileThumb = z.infer<typeof fileThumbSchema>;

/** A thumbnail is a JPEG of at most this many bytes (640px at 0.82 is 10–80 KB; Q171). */
export const THUMB_MAX_BYTES = 1024 * 1024;
export type FileFinishInput = z.input<typeof fileFinishSchema>;

export const fileUpdateSchema = z.object({
  id: idSchema,
  caption: captionSchema.optional(),
  takenOn: isoDateSchema.optional(),
  jobId: idSchema.nullable().optional(),
});
export type FileUpdate = z.infer<typeof fileUpdateSchema>;

/** A room's cover: one of its renderings, or null for none. */
export const roomCoverSchema = z.object({ roomId: idSchema, fileId: idSchema.nullable() });
export type RoomCover = z.infer<typeof roomCoverSchema>;

const jobFields = {
  phaseId: idSchema,
  /** Who's doing it; null for work we do ourselves or haven't given out yet (M2). */
  vendorId: idSchema.nullable(),
  name: nameSchema,
  /** Markdown: the house-wide spec, used by every covered room that has none of its own. */
  spec: notesSchema,
  notes: notesSchema,
  /** Used only when the job covers no rooms; a job with rooms takes its status from them. */
  status: z.enum(WORK_STATUSES),
  sortOrder: sortOrderSchema,
};

export const jobCreateSchema = z.object({
  ...jobFields,
  vendorId: jobFields.vendorId.default(null),
  /** Rooms the job covers from the start; more can be added or removed later. */
  roomIds: z
    .array(idSchema)
    .default([])
    .refine((ids) => new Set(ids).size === ids.length, { error: 'A room is listed twice' }),
  spec: jobFields.spec.default(''),
  notes: jobFields.notes.default(''),
  status: jobFields.status.default('unstarted'),
  sortOrder: jobFields.sortOrder.default(0),
});
/** Phase, vendor, name, spec, notes, status (no rooms only) and order can change. */
export const jobUpdateSchema = z.object(jobFields).partial().extend({ id: idSchema });
export type JobCreate = z.infer<typeof jobCreateSchema>;
export type JobCreateInput = z.input<typeof jobCreateSchema>;
export type JobUpdate = z.infer<typeof jobUpdateSchema>;

export const jobListSchema = z.object({ phaseId: idSchema, vendorId: idSchema }).partial();
export type JobList = z.infer<typeof jobListSchema>;

/** A room's spec: null = same as the job; text = this room differs. Blank text counts as null. */
const roomSpecSchema = notesSchema
  .nullable()
  .transform((v) => (v === null || v.trim() === '' ? null : v));

const jobRoomFields = {
  status: z.enum(WORK_STATUSES),
  spec: roomSpecSchema,
  notes: notesSchema,
  sortOrder: sortOrderSchema,
};

export const jobRoomCreateSchema = z.object({
  jobId: idSchema,
  roomId: idSchema,
  status: jobRoomFields.status.default('unstarted'),
  spec: jobRoomFields.spec.default(null),
  notes: jobRoomFields.notes.default(''),
  sortOrder: jobRoomFields.sortOrder.default(0),
});
/** Job and room are fixed; remove the row and add another to move it. */
export const jobRoomUpdateSchema = z.object(jobRoomFields).partial().extend({ id: idSchema });
export type JobRoomCreate = z.infer<typeof jobRoomCreateSchema>;
export type JobRoomUpdate = z.infer<typeof jobRoomUpdateSchema>;

/** The room spec & notes form: what `jobRooms.update` takes besides the id. */
export const jobRoomFormSchema = jobRoomUpdateSchema.pick({ spec: true, notes: true });
export type JobRoomForm = z.infer<typeof jobRoomFormSchema>;
export type JobRoomFormInput = z.input<typeof jobRoomFormSchema>;

/** Phase form: the create schema's input shape, reused for edits. */
export type PhaseCreateInput = z.input<typeof phaseCreateSchema>;

// --- money (M3) -----------------------------------------------------------------------------

export const MONEY_HELP = 'Enter an amount like 1,234.56';

/**
 * An amount as a person types it ("1,234.56", "$90") or a number that is already integer cents.
 * Like `lengthSchema`, this lets one schema serve the form (text in, cents out) and the API (the
 * form's cents in, unchanged): text is dollars, a number is cents. Output is integer cents
 * (ADR-004), parsed by `cents` in ./money.
 */
const parseDollars = (v: string | number, ctx: z.RefinementCtx): number => {
  if (typeof v === 'number') {
    if (Number.isSafeInteger(v)) return v === 0 ? 0 : v;
    ctx.addIssue({ code: 'custom', message: MONEY_HELP });
    return z.NEVER;
  }
  try {
    return cents(v);
  } catch {
    ctx.addIssue({ code: 'custom', message: MONEY_HELP });
    return z.NEVER;
  }
};

/** Typed dollars → cents, 0 or more. */
export const moneyInputSchema = z
  .union([z.string(), z.number()])
  .transform(parseDollars)
  .refine((c) => c >= 0, { error: 'Enter 0 or more' });
/** Typed dollars → cents, more than 0. */
export const positiveMoneyInputSchema = z
  .union([z.string(), z.number()])
  .transform(parseDollars)
  .refine((c) => c > 0, { error: 'Enter an amount above 0' });
/**
 * Typed dollars → cents, either sign (money added to or taken from the pool). 0 is allowed: a
 * known adjustment can be entered before its amount is (the 401K loan, Q29).
 */
export const signedMoneyInputSchema = z.union([z.string(), z.number()]).transform(parseDollars);

const urlishSchema = z.string().trim().max(2000, 'Keep the link under 2,000 characters');
const shortText = (max: number, what: string) =>
  z.string().trim().max(max, `Keep the ${what} under ${max} characters`);

/** A one-field form: what was paid for a line, or how much came back. */
export const amountFormSchema = z.object({ amount: moneyInputSchema });
export type AmountForm = z.infer<typeof amountFormSchema>;
export type AmountFormInput = z.input<typeof amountFormSchema>;

// Categories -----------------------------------------------------------------------------------

export const categoryCreateSchema = z.object({ name: nameSchema });
export const categoryUpdateSchema = z.object({
  id: idSchema,
  name: nameSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});
/** Move every line from `id` to `intoId`, then remove `id`. */
export const categoryMergeSchema = z
  .object({ id: idSchema, intoId: idSchema })
  .refine((v) => v.id !== v.intoId, { error: 'Pick a different category to merge into' });
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type CategoryMerge = z.infer<typeof categoryMergeSchema>;

// Shopping lines -------------------------------------------------------------------------------

const shoppingFields = {
  phaseId: idSchema,
  /** Null = the whole house. */
  roomId: idSchema.nullable(),
  categoryId: idSchema,
  /** "For this job" (tile for flooring); must be in the same phase. */
  jobId: idSchema.nullable(),
  name: nameSchema,
  link: urlishSchema,
  store: shortText(120, 'store'),
  modelNumber: shortText(120, 'model number'),
  quantity: z
    .number({ error: 'Enter a whole number, 1 or more' })
    .int('Enter a whole number, 1 or more')
    .min(1, 'Enter a whole number, 1 or more'),
  /** The expected line total. */
  priceCents: moneyInputSchema,
  notes: notesSchema,
};

export const shoppingLineCreateSchema = z.object({
  ...shoppingFields,
  roomId: shoppingFields.roomId.default(null),
  jobId: shoppingFields.jobId.default(null),
  link: shoppingFields.link.default(''),
  store: shoppingFields.store.default(''),
  modelNumber: shoppingFields.modelNumber.default(''),
  quantity: shoppingFields.quantity.default(1),
  priceCents: shoppingFields.priceCents.default(0),
  notes: shoppingFields.notes.default(''),
});

/**
 * Edits, and status changes with the amount each needs: Purchased needs what was paid,
 * Returned needs what came back. Moving back to To buy clears both.
 */
export const shoppingLineUpdateSchema = z
  .object(shoppingFields)
  .partial()
  .extend({
    id: idSchema,
    status: z.enum(SHOPPING_STATUSES).optional(),
    paidCents: moneyInputSchema.optional(),
    refundCents: moneyInputSchema.optional(),
  })
  .refine((v) => v.status !== 'purchased' || v.paidCents !== undefined, {
    error: 'Say what was paid',
    path: ['paidCents'],
  })
  .refine((v) => v.status !== 'returned' || v.refundCents !== undefined, {
    error: 'Say how much came back',
    path: ['refundCents'],
  });

export const shoppingLineListSchema = z
  .object({
    phaseId: idSchema,
    /** null = whole-house lines only. */
    roomId: idSchema.nullable(),
    categoryId: idSchema,
    jobId: idSchema,
    status: z.enum(SHOPPING_STATUSES),
    /** A store, matched in any case (Workflow polish, OD-75). */
    store: z.string().trim().min(1).max(120),
    /** Words to find in a line's name, store, model number or notes, in any case (OD-98). */
    q: z.string().trim().min(1).max(120),
  })
  .partial();
/**
 * Batch edits (OD-101): the room, category or job for several lines at once. Each line carries
 * its own values, so Undo can put every line back the way it was.
 */
export const shoppingLineUpdateManySchema = z.object({
  changes: z
    .array(
      z.object({
        id: idSchema,
        roomId: shoppingFields.roomId.optional(),
        categoryId: shoppingFields.categoryId.optional(),
        jobId: shoppingFields.jobId.optional(),
      }),
    )
    .min(1)
    .max(500),
});
/** Several lines by id: removing them together, or bringing them back (OD-101). */
export const shoppingLineIdsSchema = z.object({ ids: z.array(idSchema).min(1).max(500) });
export type ShoppingLineUpdateMany = z.infer<typeof shoppingLineUpdateManySchema>;

export type ShoppingLineCreate = z.infer<typeof shoppingLineCreateSchema>;
export type ShoppingLineCreateInput = z.input<typeof shoppingLineCreateSchema>;
export type ShoppingLineUpdate = z.infer<typeof shoppingLineUpdateSchema>;
export type ShoppingLineList = z.infer<typeof shoppingLineListSchema>;

/**
 * Rename a store on every line that uses it (Workflow polish, OD-69). Stores stay text on the
 * line; this fixes a spelling everywhere at once. Matching is case-insensitive.
 */
export const storeRenameSchema = z.object({
  from: shortText(120, 'store').min(1, 'Say which store to rename'),
  to: shortText(120, 'store').min(1, 'Give the store a name'),
});
export type StoreRename = z.infer<typeof storeRenameSchema>;

// Job money: cost lines and payments -----------------------------------------------------------

export const costLineCreateSchema = z.object({
  jobId: idSchema,
  /** "Pro-vision quote", "Permit", "Extra: closet trim". */
  description: nameSchema,
  amountCents: moneyInputSchema,
  notes: notesSchema.default(''),
});
export const costLineUpdateSchema = costLineCreateSchema
  .omit({ jobId: true })
  .partial()
  .extend({ id: idSchema });
export type CostLineCreate = z.infer<typeof costLineCreateSchema>;
export type CostLineCreateInput = z.input<typeof costLineCreateSchema>;
export type CostLineUpdate = z.infer<typeof costLineUpdateSchema>;

export const paymentCreateSchema = z.object({
  jobId: idSchema,
  amountCents: positiveMoneyInputSchema,
  paidOn: isoDateSchema,
  /** "Deposit", "Progress", "Final". */
  note: shortText(200, 'note').default(''),
});
export const paymentUpdateSchema = paymentCreateSchema
  .omit({ jobId: true })
  .partial()
  .extend({ id: idSchema });
export type PaymentCreate = z.infer<typeof paymentCreateSchema>;
export type PaymentCreateInput = z.input<typeof paymentCreateSchema>;
export type PaymentUpdate = z.infer<typeof paymentUpdateSchema>;

// The pool -----------------------------------------------------------------------------------

export const budgetUpdateSchema = z
  .object({
    startingCents: moneyInputSchema,
    asOf: isoDateSchema.nullable(),
    notes: notesSchema,
  })
  .partial();
export type BudgetUpdate = z.infer<typeof budgetUpdateSchema>;
export type BudgetUpdateInput = z.input<typeof budgetUpdateSchema>;

export const adjustmentCreateSchema = z.object({
  amountCents: signedMoneyInputSchema,
  on: isoDateSchema,
  note: shortText(200, 'note').default(''),
});
export const adjustmentUpdateSchema = adjustmentCreateSchema.partial().extend({ id: idSchema });
export type AdjustmentCreate = z.infer<typeof adjustmentCreateSchema>;
export type AdjustmentCreateInput = z.input<typeof adjustmentCreateSchema>;
export type AdjustmentUpdate = z.infer<typeof adjustmentUpdateSchema>;

// --- spreadsheet import (OD-36) ---------------------------------------------------------------

/** Blank cells come through as ''. */
const cell = z.string().trim();

/**
 * One row of the import's lines file (`import/spreadsheet-lines.csv`), as the importer checks it
 * before writing anything. Amounts are typed dollars ("16,335.25"). `job_match` lists the names
 * an existing job may have, separated by ";".
 */
export const importLineSchema = z.object({
  id: cell.min(1),
  action: z.enum(['import', 'skip']),
  kind: z.enum(['budget', 'vendor', 'job_cost', 'shopping']),
  phase: cell,
  room: cell,
  category: cell,
  job: cell,
  job_match: cell,
  vendor: cell,
  trade: cell,
  name: nameSchema,
  /** Blank = $0 (a line with no price yet). */
  amount: cell
    .transform((v, ctx) => (v === '' ? 0 : parseDollars(v, ctx)))
    .refine((c) => c >= 0, { error: 'Enter 0 or more' }),
  store: cell,
  link: urlishSchema,
  model_number: cell,
  quantity: cell.transform((v, ctx) => {
    if (v === '') return 1;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) {
      ctx.addIssue({ code: 'custom', message: 'Enter a whole number, 1 or more' });
      return z.NEVER;
    }
    return n;
  }),
  notes: notesSchema,
  flags: cell,
  source: cell,
});
export type ImportLine = z.infer<typeof importLineSchema>;

/**
 * One row of the image list (`import/spreadsheet-images.csv`, OD-61): a picture from the
 * spreadsheet and the lines-file line it belongs to. `skip` rows (the heading-row pictures,
 * until Chris places them) are read but not loaded.
 */
export const importImageSchema = z
  .object({
    id: cell.min(1),
    action: z.enum(['import', 'skip']),
    line_id: cell,
    line: cell,
    image: cell.regex(
      /^[\w.-]+\.(png|jpe?g|webp)$/i,
      'Name a .png, .jpg or .webp in import/images',
    ),
    source: cell,
    note: cell,
  })
  .refine((r) => r.action === 'skip' || r.line_id !== '', {
    error: 'Say which line (line_id) the picture belongs to',
    path: ['line_id'],
  });
export type ImportImage = z.infer<typeof importImageSchema>;

// --- estimates (M4, OD-62) -------------------------------------------------------------------

/** An amount, or blank/null for none yet (a Requested estimate). */
const optionalMoneySchema = z
  .union([z.string(), z.number(), z.null()])
  .transform((v, ctx) => (v === null || v === '' ? null : parseDollars(v, ctx)))
  .refine((c) => c === null || c >= 0, { error: 'Enter 0 or more' });
const optionalDateSchema = z
  .union([isoDateSchema, z.literal(''), z.null()])
  .transform((v) => (v === '' ? null : v));

const estimateFields = {
  vendorId: idSchema,
  amountCents: optionalMoneySchema,
  receivedOn: optionalDateSchema,
  validUntil: optionalDateSchema,
  notes: notesSchema,
};
const AMOUNT_NEEDED = 'Enter the amount, or mark it as requested';

const estimateBase = z.object({
  ...estimateFields,
  status: z.enum(['requested', 'received']).default('received'),
  receivedOn: estimateFields.receivedOn.default(null),
  validUntil: estimateFields.validUntil.default(null),
  notes: notesSchema.default(''),
});
const amountUnlessRequested = <T extends { status: string; amountCents: number | null }>(e: T) =>
  e.status === 'requested' || e.amountCents !== null;

/** The estimate form (the job comes from the page). */
export const estimateFormSchema = estimateBase.refine(amountUnlessRequested, {
  error: AMOUNT_NEEDED,
  path: ['amountCents'],
});
export type EstimateForm = z.infer<typeof estimateFormSchema>;

/** A new estimate: Received with an amount, or Requested (asked for, no amount yet). */
export const estimateCreateSchema = estimateBase
  .extend({ jobId: idSchema })
  .refine(amountUnlessRequested, { error: AMOUNT_NEEDED, path: ['amountCents'] });
export type EstimateCreate = z.infer<typeof estimateCreateSchema>;
export type EstimateCreateInput = z.input<typeof estimateCreateSchema>;

/**
 * Changes to an estimate. Status here is Requested, Received or Declined by hand; choosing has
 * its own call because it changes the job's money.
 */
export const estimateUpdateSchema = z
  .object(estimateFields)
  .partial()
  .extend({ id: idSchema, status: z.enum(['requested', 'received', 'declined']).optional() });
export type EstimateUpdate = z.infer<typeof estimateUpdateSchema>;
export type EstimateFormInput = z.input<typeof estimateFormSchema>;
