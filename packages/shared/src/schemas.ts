// Input schemas shared by the API (tRPC inputs) and the web forms (zodResolver), so both
// validate the same way (docs/conventions.md → API, Forms). Output types are what the API
// stores: inches as numbers, dates as ISO strings, names trimmed.

import { z } from 'zod';
import { isIsoDate } from './date';
import { parseLength, snapInches } from './length';

export const PHASE_STATUSES = ['planned', 'active', 'complete'] as const;
export type PhaseStatusInput = (typeof PHASE_STATUSES)[number];

/** ADR-013: `awaiting_review` = the work is done and someone still has to verify it's good. */
export const WORK_STATUSES = [
  'unstarted',
  'in_progress',
  'awaiting_review',
  'completed',
  'cancelled',
] as const;
export type WorkStatusInput = (typeof WORK_STATUSES)[number];

export const idSchema = z.uuid({ error: 'id must be a UUID' });
export const nameSchema = z.string().trim().min(1, 'Name is required').max(120, 'Name is too long');
export const notesSchema = z.string().max(10_000, 'Too long');
export const sortOrderSchema = z.number().int().min(0);

/** `YYYY-MM-DD` or null. Rejects impossible dates (ADR-004). */
export const isoDateSchema = z
  .string()
  .trim()
  .refine(isIsoDate, { error: 'Date must be YYYY-MM-DD' });

/**
 * A length as a person types it (`7' 3 1/2"`, `87.5`, `3/4"`) or already in inches; empty
 * means not measured. Output is inches snapped to 1/16" (ADR-011) or null.
 */
export const lengthSchema = z
  .union([z.string(), z.number(), z.null()])
  .transform((v, ctx): number | null => {
    if (v === null) return null;
    try {
      if (typeof v === 'number') return snapInches(v, 'length');
      if (v.trim() === '') return null;
      return parseLength(v);
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: e instanceof Error ? e.message : 'Bad length' });
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

// --- items ----------------------------------------------------------------------------------

const itemFields = {
  name: nameSchema,
  sortOrder: sortOrderSchema,
  /** true retires the item (hidden from new work, kept on existing work); false restores it. */
  retired: z.boolean(),
};

export const itemCreateSchema = z.object({
  name: itemFields.name,
  sortOrder: itemFields.sortOrder.default(0),
});
export const itemUpdateSchema = z.object(itemFields).partial().extend({ id: idSchema });
export type ItemCreate = z.infer<typeof itemCreateSchema>;
export type ItemCreateInput = z.input<typeof itemCreateSchema>;
export type ItemUpdate = z.infer<typeof itemUpdateSchema>;

// --- work items -----------------------------------------------------------------------------

const workItemFields = {
  phaseId: idSchema,
  status: z.enum(WORK_STATUSES),
  /** Markdown. */
  spec: notesSchema,
  notes: notesSchema,
  sortOrder: sortOrderSchema,
};

/** `roomId` null = the item's house-wide default (ADR-009). Item and room are fixed after creation. */
export const workItemCreateSchema = z.object({
  itemId: idSchema,
  roomId: idSchema.nullable().default(null),
  ...workItemFields,
  status: workItemFields.status.default('unstarted'),
  spec: workItemFields.spec.default(''),
  notes: workItemFields.notes.default(''),
  sortOrder: workItemFields.sortOrder.default(0),
});
export const workItemUpdateSchema = z.object(workItemFields).partial().extend({ id: idSchema });
export type WorkItemCreate = z.infer<typeof workItemCreateSchema>;
export type WorkItemUpdate = z.infer<typeof workItemUpdateSchema>;

export const workItemListSchema = z
  .object({
    phaseId: idSchema,
    roomId: idSchema.nullable(),
    itemId: idSchema,
  })
  .partial();
export type WorkItemList = z.infer<typeof workItemListSchema>;
