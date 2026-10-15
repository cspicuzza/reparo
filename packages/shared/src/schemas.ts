// Input schemas shared by the API (tRPC inputs) and the web forms (zodResolver), so both
// validate the same way. Output types are what the API
// stores: inches as numbers, dates as ISO strings, names trimmed.

import { z } from 'zod';
import { isIsoDate } from './date';
import { parseLength, snapInches } from './length';

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
