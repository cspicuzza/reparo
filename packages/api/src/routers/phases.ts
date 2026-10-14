import { idSchema, phaseCreateSchema, phaseUpdateSchema } from '@reparo/shared';
import { z } from 'zod';
import { adminProcedure, memberProcedure, router } from '../trpc';
import { createPhase, getPhase, listPhases, removePhase, updatePhase } from '../services/phases';

/** Phases are admin-managed (ADR-008). */
export const phasesRouter = router({
  list: memberProcedure.query(({ ctx }) => listPhases(ctx.db)),
  get: memberProcedure
    .input(z.object({ id: idSchema }))
    .query(({ ctx, input }) => getPhase(ctx.db, input.id)),
  create: adminProcedure
    .input(phaseCreateSchema)
    .mutation(({ ctx, input }) => createPhase(ctx.db, input)),
  update: adminProcedure
    .input(phaseUpdateSchema)
    .mutation(({ ctx, input }) => updatePhase(ctx.db, input)),
  remove: adminProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => removePhase(ctx.db, input.id)),
});
