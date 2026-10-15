import { estimateCreateSchema, estimateUpdateSchema, idSchema } from '@reparo/shared';
import { z } from 'zod';
import { editorProcedure, memberProcedure, router } from '../trpc';
import {
  chooseEstimate,
  createEstimate,
  listEstimates,
  removeEstimate,
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
  remove: editorProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => removeEstimate(ctx.db, input.id)),
});
