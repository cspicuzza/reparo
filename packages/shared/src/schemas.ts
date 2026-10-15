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
] as const;
export const FILE_OWNER_TYPES = ['job', 'cost', 'vendor', 'quote', 'room', 'purchase'] as const;

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
  })
  .partial();
export type ShoppingLineCreate = z.infer<typeof shoppingLineCreateSchema>;
export type ShoppingLineCreateInput = z.input<typeof shoppingLineCreateSchema>;
export type ShoppingLineUpdate = z.infer<typeof shoppingLineUpdateSchema>;
export type ShoppingLineList = z.infer<typeof shoppingLineListSchema>;

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
