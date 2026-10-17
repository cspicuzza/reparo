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
  // Independent reads, so they run at the same time (OD-153).
  const [pool, allPhases, allJobs, lines, categories, rooms] = await Promise.all([
    getBudget(db),
    listPhases(db),
    listJobs(db),
    db
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
      .where(and(isNull(shoppingLines.deletedAt), isNull(phases.deletedAt))),
    listCategories(db),
    listRooms(db),
  ]);

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

  // Things still to buy with no price yet, in the phases that count: Planned can't include them,
  // so the pages say how many there are (OD-143, Q212). The money rule itself is unchanged.
  const counting = new Set(allPhases.filter((p) => p.status !== 'planned').map((p) => p.id));
  const unpricedCount = lines.filter(
    (l) => l.status === 'to_buy' && l.priceCents === 0 && counting.has(l.phaseId),
  ).length;

  const none = { spentCents: 0, committedCents: 0 };
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
    unpricedCount,
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
