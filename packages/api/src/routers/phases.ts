import { idSchema, moveSchema, phaseCreateSchema, phaseUpdateSchema } from '@reparo/shared';
import { z } from 'zod';
import { adminProcedure, memberProcedure, router } from '../trpc';
import { listPhasesForPage } from '../services/phase-progress';
import { createPhase, getPhase, movePhase, removePhase, updatePhase } from '../services/phases';

/** Phases are admin-managed (ADR-008). */
export const phasesRouter = router({
  /** With each phase's progress and money (OD-123). */
  list: memberProcedure.query(({ ctx }) => listPhasesForPage(ctx.db)),
  get: memberProcedure
    .input(z.object({ id: idSchema }))
    .query(({ ctx, input }) => getPhase(ctx.db, input.id)),
  create: adminProcedure
    .input(phaseCreateSchema)
    .mutation(({ ctx, input }) => createPhase(ctx.db, input)),
  update: adminProcedure
    .input(phaseUpdateSchema)
    .mutation(({ ctx, input }) => updatePhase(ctx.db, input)),
  /** One place up or down the list (OD-117, Q141). */
  move: adminProcedure.input(moveSchema).mutation(({ ctx, input }) => movePhase(ctx.db, input)),
  remove: adminProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => removePhase(ctx.db, input.id)),
});
