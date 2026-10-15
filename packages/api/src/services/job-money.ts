import {
  and,
  asc,
  costLines,
  eq,
  estimates,
  inArray,
  isNull,
  jobs,
  payments,
  sql,
  type Db,
} from '@reparo/db';
import type { CostLineCreate, CostLineUpdate, PaymentCreate, PaymentUpdate } from '@reparo/shared';
import { badRequest, notFound } from './errors';

// What a job costs (cost lines: the vendor's price, then permits, fees, extras) and what has
// been paid toward it (payments against the job as a whole). M3, OD-50; Q10.

async function liveJob(db: Db, id: string) {
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, id), isNull(jobs.deletedAt)));
  if (!row) throw notFound('Job');
  return row;
}

/** Live cost lines and payments per job, summed. Jobs with neither are absent. */
export async function jobMoneyTotals(
  db: Db,
  jobIds?: string[],
): Promise<Map<string, { costCents: number; paidCents: number }>> {
  if (jobIds !== undefined && jobIds.length === 0) return new Map();
  const costWhere = [isNull(costLines.deletedAt)];
  const payWhere = [isNull(payments.deletedAt)];
  if (jobIds !== undefined) {
    costWhere.push(inArray(costLines.jobId, jobIds));
    payWhere.push(inArray(payments.jobId, jobIds));
  }
  const costs = await db
    .select({
      jobId: costLines.jobId,
      total: sql<number>`sum(${costLines.amountCents})`.mapWith(Number),
    })
    .from(costLines)
    .where(and(...costWhere))
    .groupBy(costLines.jobId);
  const paid = await db
    .select({
      jobId: payments.jobId,
      total: sql<number>`sum(${payments.amountCents})`.mapWith(Number),
    })
    .from(payments)
    .where(and(...payWhere))
    .groupBy(payments.jobId);
  const out = new Map<string, { costCents: number; paidCents: number }>();
  for (const c of costs) out.set(c.jobId, { costCents: c.total, paidCents: 0 });
  for (const p of paid) {
    const t = out.get(p.jobId) ?? { costCents: 0, paidCents: 0 };
    t.paidCents = p.total;
    out.set(p.jobId, t);
  }
  return out;
}

// --- cost lines -------------------------------------------------------------------------------

export function listCostLines(db: Db, jobId: string) {
  return db
    .select()
    .from(costLines)
    .where(and(eq(costLines.jobId, jobId), isNull(costLines.deletedAt)))
    .orderBy(asc(costLines.sortOrder), asc(costLines.createdAt));
}

async function getCostLine(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(costLines)
    .innerJoin(jobs, eq(jobs.id, costLines.jobId))
    .where(and(eq(costLines.id, id), isNull(costLines.deletedAt), isNull(jobs.deletedAt)));
  if (!row) throw notFound('Cost line');
  return row.cost_lines;
}

/** New lines go after the job's others. */
export async function createCostLine(db: Db, input: CostLineCreate) {
  await liveJob(db, input.jobId);
  const existing = await listCostLines(db, input.jobId);
  const sortOrder = existing.reduce((m, l) => Math.max(m, l.sortOrder), 0) + 10;
  const [row] = await db
    .insert(costLines)
    .values({ ...input, sortOrder })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function updateCostLine(db: Db, { id, ...patch }: CostLineUpdate) {
  await getCostLine(db, id);
  const [row] = await db.update(costLines).set(patch).where(eq(costLines.id, id)).returning();
  if (!row) throw notFound('Cost line');
  return row;
}

export async function removeCostLine(db: Db, id: string) {
  await getCostLine(db, id);
  // The chosen estimate's quote line goes with the estimate (M4, Q28), not on its own.
  const quote = await db
    .select({ id: estimates.id })
    .from(estimates)
    .where(and(eq(estimates.costLineId, id), isNull(estimates.deletedAt)));
  if (quote.length > 0) {
    throw badRequest(
      'This is the chosen quote. Remove the estimate, or choose another, to change it.',
    );
  }
  await db.update(costLines).set({ deletedAt: new Date() }).where(eq(costLines.id, id));
  return { id };
}

// --- payments ---------------------------------------------------------------------------------

export function listPayments(db: Db, jobId: string) {
  return db
    .select()
    .from(payments)
    .where(and(eq(payments.jobId, jobId), isNull(payments.deletedAt)))
    .orderBy(asc(payments.paidOn), asc(payments.createdAt));
}

async function getPayment(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(payments)
    .innerJoin(jobs, eq(jobs.id, payments.jobId))
    .where(and(eq(payments.id, id), isNull(payments.deletedAt), isNull(jobs.deletedAt)));
  if (!row) throw notFound('Payment');
  return row.payments;
}

export async function createPayment(db: Db, input: PaymentCreate) {
  await liveJob(db, input.jobId);
  const [row] = await db.insert(payments).values(input).returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function updatePayment(db: Db, { id, ...patch }: PaymentUpdate) {
  await getPayment(db, id);
  const [row] = await db.update(payments).set(patch).where(eq(payments.id, id)).returning();
  if (!row) throw notFound('Payment');
  return row;
}

export async function removePayment(db: Db, id: string) {
  await getPayment(db, id);
  await db.update(payments).set({ deletedAt: new Date() }).where(eq(payments.id, id));
  return { id };
}
