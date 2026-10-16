import {
  and,
  asc,
  costLines,
  eq,
  estimates,
  gte,
  inArray,
  isNull,
  jobs,
  lte,
  ne,
  phases,
  sql,
  vendors,
  type Db,
  type Estimate,
} from '@reparo/db';
import {
  addDays,
  today,
  type EstimateCreate,
  type EstimateUpdate,
  type IsoDate,
} from '@reparo/shared';
import { badRequest, notFound } from './errors';
import { jobMoneyTotals } from './job-money';
import { vendorSummary } from './vendors';

// Estimates (M4, OD-62; Linear *Data model* doc → M4 → Estimates; grilling 2026-10-15 Q1–Q3,
// Q12, Q13, Q27–Q29). A job collects estimates from several vendors. Choosing one puts its
// amount on the job as one "<Vendor> quote" cost line and makes that vendor the job's vendor;
// the money rules only read cost lines, so an estimate that isn't chosen counts for nothing.

const live = () => isNull(estimates.deletedAt);

async function liveJob(db: Db, id: string) {
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, id), isNull(jobs.deletedAt)));
  if (!row) throw notFound('Job');
}

/** A vendor that's live (archived ones can't be given new estimates). */
async function liveVendor(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, id), isNull(vendors.deletedAt)));
  if (!row) throw notFound('Vendor');
  return row;
}

async function getLive(db: Db, id: string): Promise<Estimate> {
  const [row] = await db
    .select({ estimate: estimates })
    .from(estimates)
    .innerJoin(jobs, eq(jobs.id, estimates.jobId))
    .where(and(eq(estimates.id, id), live(), isNull(jobs.deletedAt)));
  if (!row) throw notFound('Estimate');
  return row.estimate;
}

/** A job's estimates, oldest first, with the vendor and which Received one is cheapest (Q14). */
export async function listEstimates(db: Db, jobId: string) {
  await liveJob(db, jobId);
  const rows = await db
    .select({ estimate: estimates, vendor: vendors })
    .from(estimates)
    .innerJoin(vendors, eq(vendors.id, estimates.vendorId))
    .where(and(eq(estimates.jobId, jobId), live()))
    .orderBy(asc(estimates.sortOrder), asc(estimates.createdAt));
  const received = rows.filter(
    (r) => r.estimate.status === 'received' && r.estimate.amountCents !== null,
  );
  const cheapest = received.reduce<number | null>(
    (min, r) =>
      min === null || (r.estimate.amountCents ?? 0) < min ? (r.estimate.amountCents ?? 0) : min,
    null,
  );
  // Only worth marking when there's something to compare it with.
  const markCheapest = received.length > 1;
  const today_ = today();
  return rows.map(({ estimate: e, vendor }) => ({
    ...e,
    vendor: vendorSummary(vendor),
    isCheapest:
      markCheapest &&
      e.status === 'received' &&
      e.amountCents !== null &&
      e.amountCents === cheapest,
    isExpired: e.validUntil !== null && e.validUntil < today_,
  }));
}

/** Live estimate counts per job, for the Jobs list ("3 estimates, none chosen", Q14). */
export async function estimateCounts(
  db: Db,
  jobIds: string[],
): Promise<Map<string, { total: number; chosen: boolean }>> {
  if (jobIds.length === 0) return new Map();
  const rows = await db
    .select({
      jobId: estimates.jobId,
      total: sql<number>`count(*)`.mapWith(Number),
      chosen: sql<number>`count(*) filter (where ${estimates.status} = 'chosen')`.mapWith(Number),
    })
    .from(estimates)
    .where(and(inArray(estimates.jobId, jobIds), live()))
    .groupBy(estimates.jobId);
  return new Map(rows.map((r) => [r.jobId, { total: r.total, chosen: r.chosen > 0 }]));
}

/** Received estimates on live jobs that run out within `days` (Q4, Home → Needs you). */
export async function expiringEstimates(db: Db, days = 7, from: IsoDate = today()) {
  const until = addDays(from, days);
  return db
    .select({
      id: estimates.id,
      jobId: jobs.id,
      jobName: jobs.name,
      vendorName: vendors.name,
      amountCents: estimates.amountCents,
      validUntil: estimates.validUntil,
    })
    .from(estimates)
    .innerJoin(jobs, eq(jobs.id, estimates.jobId))
    .innerJoin(phases, eq(phases.id, jobs.phaseId))
    .innerJoin(vendors, eq(vendors.id, estimates.vendorId))
    .where(
      and(
        live(),
        isNull(jobs.deletedAt),
        isNull(phases.deletedAt),
        eq(estimates.status, 'received'),
        gte(estimates.validUntil, from),
        lte(estimates.validUntil, until),
      ),
    )
    .orderBy(asc(estimates.validUntil), asc(jobs.name));
}

export async function createEstimate(db: Db, input: EstimateCreate) {
  await liveJob(db, input.jobId);
  await liveVendor(db, input.vendorId);
  const [last] = await db
    .select({ max: sql<number>`coalesce(max(${estimates.sortOrder}), 0)`.mapWith(Number) })
    .from(estimates)
    .where(eq(estimates.jobId, input.jobId));
  const [row] = await db
    .insert(estimates)
    .values({ ...input, sortOrder: (last?.max ?? 0) + 10 })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

const quoteLine = (vendorName: string) => `${vendorName} quote`;

/**
 * Edit an estimate. On the chosen one, a new amount or vendor carries through to the job's
 * quote line and vendor, so the job's price always reflects the chosen quote (Q12).
 */
export async function updateEstimate(db: Db, { id, ...patch }: EstimateUpdate) {
  const e = await getLive(db, id);
  if (patch.vendorId !== undefined && patch.vendorId !== e.vendorId) {
    await liveVendor(db, patch.vendorId);
  }
  if (e.status === 'chosen' && patch.status !== undefined) {
    throw badRequest('Choose another estimate, or remove this one, to change the chosen one');
  }
  const status = patch.status ?? e.status;
  const amount = patch.amountCents === undefined ? e.amountCents : patch.amountCents;
  if (status !== 'requested' && amount === null) {
    throw badRequest('Enter the amount, or mark it as requested');
  }
  if (e.status === 'chosen' && amount === null) {
    throw badRequest('The chosen estimate needs an amount');
  }
  const set: Partial<Estimate> = {};
  if (patch.vendorId !== undefined) set.vendorId = patch.vendorId;
  if (patch.amountCents !== undefined) set.amountCents = patch.amountCents;
  if (patch.receivedOn !== undefined) set.receivedOn = patch.receivedOn;
  if (patch.validUntil !== undefined) set.validUntil = patch.validUntil;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.status !== undefined) {
    set.status = patch.status;
    // A status set by hand clears any "declined because another was chosen" memory.
    set.declinedFrom = null;
  }
  const [row] = await db.update(estimates).set(set).where(eq(estimates.id, id)).returning();
  if (!row) throw notFound('Estimate');

  if (row.status === 'chosen' && row.costLineId) {
    const vendor = await liveVendorOrAny(db, row.vendorId);
    await db
      .update(costLines)
      .set({ amountCents: row.amountCents ?? 0, description: quoteLine(vendor.name) })
      .where(eq(costLines.id, row.costLineId));
    await db.update(jobs).set({ vendorId: row.vendorId }).where(eq(jobs.id, row.jobId));
  }
  return row;
}

async function liveVendorOrAny(db: Db, id: string) {
  const [row] = await db.select().from(vendors).where(eq(vendors.id, id));
  if (!row) throw notFound('Vendor');
  return row;
}

/**
 * Choose an estimate (Q12, Q13, Q27):
 * - its amount goes on the job as the "<Vendor> quote" cost line: the line the previously
 *   chosen estimate had, moved over, or a new one listed first; other cost lines are untouched;
 * - its vendor becomes the job's vendor;
 * - every other Received or Requested estimate on the job (and the one chosen before) is
 *   declined, remembering what it was, so removing the chosen one can put them back.
 * Allowed after payments; what's been paid stays on the job. Returns the job's paid total so
 * the caller can say so.
 */
export async function chooseEstimate(db: Db, id: string) {
  const e = await getLive(db, id);
  if (e.status === 'requested' || e.amountCents === null) {
    throw badRequest('Add the amount before choosing this estimate');
  }
  const paidCents = (await jobMoneyTotals(db, [e.jobId])).get(e.jobId)?.paidCents ?? 0;
  const [job] = await db.select({ vendorId: jobs.vendorId }).from(jobs).where(eq(jobs.id, e.jobId));
  // What Undo needs to put things back (OD-119, Q147).
  const before = {
    previousChosenId: null as string | null,
    previousVendorId: job?.vendorId ?? null,
  };
  if (e.status === 'chosen') return { estimate: e, paidCents, ...before };

  const vendor = await liveVendorOrAny(db, e.vendorId);
  const [current] = await db
    .select()
    .from(estimates)
    .where(and(eq(estimates.jobId, e.jobId), eq(estimates.status, 'chosen'), live()));
  before.previousChosenId = current?.id ?? null;

  // The quote line: moved from the previous choice, or new and listed before the others.
  let lineId: string;
  if (current?.costLineId) {
    lineId = current.costLineId;
    await db
      .update(estimates)
      .set({ status: 'declined', declinedFrom: 'received', costLineId: null })
      .where(eq(estimates.id, current.id));
    await db
      .update(costLines)
      .set({ amountCents: e.amountCents, description: quoteLine(vendor.name), deletedAt: null })
      .where(eq(costLines.id, lineId));
  } else {
    const [line] = await db
      .insert(costLines)
      .values({
        jobId: e.jobId,
        description: quoteLine(vendor.name),
        amountCents: e.amountCents,
        sortOrder: 0,
      })
      .returning();
    if (!line) throw new Error('insert returned no row');
    lineId = line.id;
  }

  // Decline the rest, remembering what each was. Already-declined ones keep their memory.
  for (const from of ['received', 'requested'] as const) {
    await db
      .update(estimates)
      .set({ status: 'declined', declinedFrom: from })
      .where(
        and(
          eq(estimates.jobId, e.jobId),
          ne(estimates.id, e.id),
          eq(estimates.status, from),
          live(),
        ),
      );
  }
  const [chosen] = await db
    .update(estimates)
    .set({ status: 'chosen', declinedFrom: null, costLineId: lineId })
    .where(eq(estimates.id, e.id))
    .returning();
  await db.update(jobs).set({ vendorId: e.vendorId }).where(eq(jobs.id, e.jobId));
  return { estimate: chosen ?? e, paidCents, ...before };
}

/** Put back the estimates a choice declined: each to what it was before (Q28). */
async function restoreDeclined(db: Db, jobId: string) {
  await db
    .update(estimates)
    .set({ status: sql`${estimates.declinedFrom}`, declinedFrom: null })
    .where(
      and(
        eq(estimates.jobId, jobId),
        eq(estimates.status, 'declined'),
        sql`${estimates.declinedFrom} IS NOT NULL`,
        live(),
      ),
    );
}

/**
 * Undo a choice, within its 10 seconds (OD-119, Q147). With an estimate chosen before, that one
 * is chosen again (the quote line moves back to it); with none, this one goes back to
 * Received, its quote line goes, and the estimates it declined come back. Either way the job's
 * vendor goes back to who it was. If this estimate is no longer the chosen one, nothing
 * changes: the last save wins.
 */
export async function undoChoose(
  db: Db,
  input: { id: string; previousChosenId: string | null; previousVendorId: string | null },
) {
  const e = await getLive(db, input.id);
  if (e.status !== 'chosen') return { undone: false };
  if (input.previousChosenId) {
    const prev = await getLive(db, input.previousChosenId);
    if (prev.jobId !== e.jobId) throw badRequest('That estimate is on another job');
    await chooseEstimate(db, prev.id);
  } else {
    if (e.costLineId) {
      await db
        .update(costLines)
        .set({ deletedAt: new Date() })
        .where(eq(costLines.id, e.costLineId));
    }
    await db
      .update(estimates)
      .set({ status: 'received', declinedFrom: null, costLineId: null })
      .where(eq(estimates.id, e.id));
    await restoreDeclined(db, e.jobId);
  }
  if (input.previousVendorId) await liveVendorOrAny(db, input.previousVendorId);
  await db.update(jobs).set({ vendorId: input.previousVendorId }).where(eq(jobs.id, e.jobId));
  return { undone: true };
}

/**
 * Remove an estimate (soft delete). Removing the chosen one also removes its quote line and
 * puts back the estimates its choice declined; the job keeps its vendor (Q28).
 */
export async function removeEstimate(db: Db, id: string) {
  const e = await getLive(db, id);
  if (e.status === 'chosen' && e.costLineId) {
    await db.update(costLines).set({ deletedAt: new Date() }).where(eq(costLines.id, e.costLineId));
    await db
      .update(estimates)
      .set({ status: sql`${estimates.declinedFrom}`, declinedFrom: null })
      .where(
        and(
          eq(estimates.jobId, e.jobId),
          eq(estimates.status, 'declined'),
          sql`${estimates.declinedFrom} IS NOT NULL`,
          live(),
        ),
      );
  }
  await db.update(estimates).set({ deletedAt: new Date() }).where(eq(estimates.id, id));
  return { id };
}
