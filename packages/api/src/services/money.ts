import { and, eq, isNull, phases, shoppingLines, type Db } from '@reparo/db';
import { getBudget } from './budget';
import { listCategories } from './categories';
import { listJobs } from './jobs';
import { moneySummary } from './money-rules';
import { listPhases } from './phases';
import { listRooms } from './rooms';

/**
 * Everything the Money page and Home's headline show, in one read (M3, OD-50). The rules live
 * in ./money-rules; this gathers the live rows and puts names on the totals.
 */
export async function getMoneySummary(db: Db) {
  const pool = await getBudget(db);
  const allPhases = await listPhases(db);
  const allJobs = await listJobs(db);
  const lines = await db
    .select({
      phaseId: shoppingLines.phaseId,
      roomId: shoppingLines.roomId,
      categoryId: shoppingLines.categoryId,
      status: shoppingLines.status,
      priceCents: shoppingLines.priceCents,
      paidCents: shoppingLines.paidCents,
      refundCents: shoppingLines.refundCents,
    })
    .from(shoppingLines)
    .innerJoin(phases, eq(phases.id, shoppingLines.phaseId))
    .where(and(isNull(shoppingLines.deletedAt), isNull(phases.deletedAt)));

  const s = moneySummary({
    poolCents: pool.poolCents,
    phases: allPhases,
    jobs: allJobs.map((j) => ({
      id: j.id,
      phaseId: j.phaseId,
      cancelled: j.progress.status === 'cancelled',
      costCents: j.money.costCents,
      paidCents: j.money.paidCents,
    })),
    lines,
  });

  const none = { spentCents: 0, committedCents: 0 };
  const categories = await listCategories(db);
  const rooms = await listRooms(db);
  return {
    pool: {
      startingCents: pool.startingCents,
      asOf: pool.asOf,
      adjustmentsCents: pool.adjustmentsCents,
      poolCents: pool.poolCents,
    },
    spentCents: s.spentCents,
    committedCents: s.committedCents,
    availableCents: s.availableCents,
    byPhase: s.byPhase,
    jobs: s.jobs,
    shopping: s.shopping,
    byCategory: categories.map((c) => ({
      id: c.id,
      name: c.name,
      ...(s.byCategory.get(c.id) ?? none),
    })),
    byRoom: [
      ...rooms.map((r) => ({ id: r.id, name: r.name, ...(s.byRoom.get(r.id) ?? none) })),
      { id: null, name: 'Whole house', ...(s.byRoom.get(null) ?? none) },
    ],
  };
}
