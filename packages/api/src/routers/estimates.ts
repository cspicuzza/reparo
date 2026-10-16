import { estimateCreateSchema, estimateUpdateSchema, idSchema } from '@reparo/shared';
import { z } from 'zod';
import { editorProcedure, memberProcedure, router } from '../trpc';
import {
  chooseEstimate,
  createEstimate,
  listEstimates,
  removeEstimate,
  undoChoose,
  updateEstimate,
} from '../services/estimates';

/**
 * Estimates (M4). Editors add, change, choose and remove them; choosing changes the job's
 * money (its quote line) and vendor.
 */
export const estimatesRouter = router({
  list: memberProcedure
    .input(z.object({ jobId: idSchema }))
    .query(({ ctx, input }) => listEstimates(ctx.db, input.jobId)),
  create: editorProcedure
    .input(estimateCreateSchema)
    .mutation(({ ctx, input }) => createEstimate(ctx.db, input)),
  update: editorProcedure
    .input(estimateUpdateSchema)
    .mutation(({ ctx, input }) => updateEstimate(ctx.db, input)),
  choose: editorProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => chooseEstimate(ctx.db, input.id)),
  /** Undo for choose, with what choose returned (OD-119, Q147). */
  undoChoose: editorProcedure
    .input(
      z.object({
        id: idSchema,
        previousChosenId: idSchema.nullable(),
        previousVendorId: idSchema.nullable(),
      }),
    )
    .mutation(({ ctx, input }) => undoChoose(ctx.db, input)),
  remove: editorProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => removeEstimate(ctx.db, input.id)),
});
