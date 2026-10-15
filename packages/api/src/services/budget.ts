import { and, asc, budget, budgetAdjustments, eq, isNull, type Db } from '@reparo/db';
import {
  sumCents,
  type AdjustmentCreate,
  type AdjustmentUpdate,
  type BudgetUpdate,
} from '@reparo/shared';
import { notFound } from './errors';

// The money pool (M3, OD-50): a starting balance ($300,000 as of 9/3) and a ledger of signed
// adjustments ("401K loan"). Only the admin changes it.

const liveAdj = () => isNull(budgetAdjustments.deletedAt);

async function budgetRow(db: Db) {
  const [row] = await db.select().from(budget);
  if (!row) throw new Error('The budget row is missing; run the migrations');
  return row;
}

/** The pool as it stands: starting balance, adjustments in date order, and the total. */
export async function getBudget(db: Db) {
  const row = await budgetRow(db);
  const adjustments = await db
    .select()
    .from(budgetAdjustments)
    .where(liveAdj())
    .orderBy(asc(budgetAdjustments.on), asc(budgetAdjustments.createdAt));
  const adjustmentsCents = sumCents(adjustments.map((a) => a.amountCents));
  return {
    startingCents: row.startingCents,
    asOf: row.asOf,
    notes: row.notes,
    adjustments,
    adjustmentsCents,
    poolCents: row.startingCents + adjustmentsCents,
  };
}

export async function updateBudget(db: Db, patch: BudgetUpdate) {
  const row = await budgetRow(db);
  await db.update(budget).set(patch).where(eq(budget.id, row.id));
  return getBudget(db);
}

async function getAdjustment(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(budgetAdjustments)
    .where(and(eq(budgetAdjustments.id, id), liveAdj()));
  if (!row) throw notFound('Adjustment');
  return row;
}

export async function createAdjustment(db: Db, input: AdjustmentCreate) {
  await db.insert(budgetAdjustments).values(input);
  return getBudget(db);
}

export async function updateAdjustment(db: Db, { id, ...patch }: AdjustmentUpdate) {
  await getAdjustment(db, id);
  await db.update(budgetAdjustments).set(patch).where(eq(budgetAdjustments.id, id));
  return getBudget(db);
}

export async function removeAdjustment(db: Db, id: string) {
  await getAdjustment(db, id);
  await db
    .update(budgetAdjustments)
    .set({ deletedAt: new Date() })
    .where(eq(budgetAdjustments.id, id));
  return getBudget(db);
}
