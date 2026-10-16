import {
  adjustmentCreateSchema,
  adjustmentUpdateSchema,
  budgetUpdateSchema,
  categoryCreateSchema,
  categoryMergeSchema,
  categoryUpdateSchema,
  costLineCreateSchema,
  costLineUpdateSchema,
  idSchema,
  paymentCreateSchema,
  paymentUpdateSchema,
  shoppingLineCreateSchema,
  shoppingLineListSchema,
  shoppingLineIdsSchema,
  shoppingLineUpdateManySchema,
  shoppingLineUpdateSchema,
  storeRenameSchema,
} from '@reparo/shared';
import { z } from 'zod';
import { adminProcedure, editorProcedure, memberProcedure, router } from '../trpc';
import {
  createAdjustment,
  getBudget,
  removeAdjustment,
  updateAdjustment,
  updateBudget,
} from '../services/budget';
import {
  createCategory,
  listCategories,
  mergeCategory,
  updateCategory,
} from '../services/categories';
import {
  createCostLine,
  createPayment,
  listCostLines,
  listPayments,
  removeCostLine,
  removePayment,
  updateCostLine,
  updatePayment,
} from '../services/job-money';
import { getMoneySummary } from '../services/money';
import {
  createShoppingLine,
  getShoppingLine,
  listShoppingLines,
  listStores,
  removeShoppingLine,
  renameStore,
  restoreShoppingLine,
  removeManyShoppingLines,
  restoreManyShoppingLines,
  updateManyShoppingLines,
  shoppingTotals,
  updateShoppingLine,
} from '../services/shopping-lines';

// Money (M3, OD-50). Editors keep the shopping list and a job's cost lines and payments; only the
// admin changes the pool, its adjustments and the categories (Chris, 2026-10-14, Q15, Q21).

const byId = z.object({ id: idSchema });
const byJob = z.object({ jobId: idSchema });

/** Shopping categories. Admin adds, renames and merges. */
export const categoriesRouter = router({
  list: memberProcedure.query(({ ctx }) => listCategories(ctx.db)),
  create: adminProcedure
    .input(categoryCreateSchema)
    .mutation(({ ctx, input }) => createCategory(ctx.db, input)),
  update: adminProcedure
    .input(categoryUpdateSchema)
    .mutation(({ ctx, input }) => updateCategory(ctx.db, input)),
  merge: adminProcedure
    .input(categoryMergeSchema)
    .mutation(({ ctx, input }) => mergeCategory(ctx.db, input)),
});

export const shoppingLinesRouter = router({
  list: memberProcedure
    .input(shoppingLineListSchema.default({}))
    .query(({ ctx, input }) => listShoppingLines(ctx.db, input)),
  get: memberProcedure.input(byId).query(({ ctx, input }) => getShoppingLine(ctx.db, input.id)),
  create: editorProcedure
    .input(shoppingLineCreateSchema)
    .mutation(({ ctx, input }) => createShoppingLine(ctx.db, input)),
  update: editorProcedure
    .input(shoppingLineUpdateSchema)
    .mutation(({ ctx, input }) => updateShoppingLine(ctx.db, input)),
  remove: editorProcedure
    .input(byId)
    .mutation(({ ctx, input }) => removeShoppingLine(ctx.db, input.id)),
  restore: editorProcedure
    .input(byId)
    .mutation(({ ctx, input }) => restoreShoppingLine(ctx.db, input.id)),
  /** Batch edits: room, category or job for several lines, all or none (OD-101). */
  updateMany: editorProcedure
    .input(shoppingLineUpdateManySchema)
    .mutation(({ ctx, input }) => updateManyShoppingLines(ctx.db, input)),
  /** Remove several lines together (OD-101). */
  removeMany: editorProcedure
    .input(shoppingLineIdsSchema)
    .mutation(({ ctx, input }) => removeManyShoppingLines(ctx.db, input.ids)),
  /** Undo for removeMany (OD-101). */
  restoreMany: editorProcedure
    .input(shoppingLineIdsSchema)
    .mutation(({ ctx, input }) => restoreManyShoppingLines(ctx.db, input.ids)),
  /** Counts and totals per status and room, for the same filters as `list` (OD-68). */
  totals: memberProcedure
    .input(shoppingLineListSchema.default({}))
    .query(({ ctx, input }) => shoppingTotals(ctx.db, input)),
  /** Stores in use, for suggestions (OD-69). */
  stores: memberProcedure.query(({ ctx }) => listStores(ctx.db)),
  /** Rename a store on every line (OD-69); editors and the admin. */
  renameStore: editorProcedure
    .input(storeRenameSchema)
    .mutation(({ ctx, input }) => renameStore(ctx.db, input)),
});

/** What a job costs: the vendor's price, permits, fees, extras. */
export const costLinesRouter = router({
  list: memberProcedure.input(byJob).query(({ ctx, input }) => listCostLines(ctx.db, input.jobId)),
  create: editorProcedure
    .input(costLineCreateSchema)
    .mutation(({ ctx, input }) => createCostLine(ctx.db, input)),
  update: editorProcedure
    .input(costLineUpdateSchema)
    .mutation(({ ctx, input }) => updateCostLine(ctx.db, input)),
  remove: editorProcedure
    .input(byId)
    .mutation(({ ctx, input }) => removeCostLine(ctx.db, input.id)),
});

/** What's been paid toward a job (deposit, progress, final). */
export const paymentsRouter = router({
  list: memberProcedure.input(byJob).query(({ ctx, input }) => listPayments(ctx.db, input.jobId)),
  create: editorProcedure
    .input(paymentCreateSchema)
    .mutation(({ ctx, input }) => createPayment(ctx.db, input)),
  update: editorProcedure
    .input(paymentUpdateSchema)
    .mutation(({ ctx, input }) => updatePayment(ctx.db, input)),
  remove: editorProcedure.input(byId).mutation(({ ctx, input }) => removePayment(ctx.db, input.id)),
});

/** The pool and its adjustments. Everyone reads; only the admin changes them. */
export const budgetRouter = router({
  get: memberProcedure.query(({ ctx }) => getBudget(ctx.db)),
  update: adminProcedure
    .input(budgetUpdateSchema)
    .mutation(({ ctx, input }) => updateBudget(ctx.db, input)),
});

export const budgetAdjustmentsRouter = router({
  create: adminProcedure
    .input(adjustmentCreateSchema)
    .mutation(({ ctx, input }) => createAdjustment(ctx.db, input)),
  update: adminProcedure
    .input(adjustmentUpdateSchema)
    .mutation(({ ctx, input }) => updateAdjustment(ctx.db, input)),
  remove: adminProcedure
    .input(byId)
    .mutation(({ ctx, input }) => removeAdjustment(ctx.db, input.id)),
});

/** Spent / Committed / Available and the totals by phase, category and room. */
export const moneyRouter = router({
  summary: memberProcedure.query(({ ctx }) => getMoneySummary(ctx.db)),
});
