import {
  idSchema,
  workItemCreateSchema,
  workItemListSchema,
  workItemUpdateSchema,
} from '@reparo/shared';
import { z } from 'zod';
import { editorProcedure, memberProcedure, router } from '../trpc';
import {
  createWorkItem,
  getWorkItem,
  listWorkItems,
  removeWorkItem,
  updateWorkItem,
  workForRoom,
} from '../services/work-items';

export const workItemsRouter = router({
  list: memberProcedure
    .input(workItemListSchema.default({}))
    .query(({ ctx, input }) => listWorkItems(ctx.db, input)),
  get: memberProcedure
    .input(z.object({ id: idSchema }))
    .query(({ ctx, input }) => getWorkItem(ctx.db, input.id)),
  /** Every item resolved for one room: its own override or the house-wide default. */
  forRoom: memberProcedure
    .input(z.object({ roomId: idSchema }))
    .query(({ ctx, input }) => workForRoom(ctx.db, input.roomId)),
  create: editorProcedure
    .input(workItemCreateSchema)
    .mutation(({ ctx, input }) => createWorkItem(ctx.db, input)),
  update: editorProcedure
    .input(workItemUpdateSchema)
    .mutation(({ ctx, input }) => updateWorkItem(ctx.db, input)),
  remove: editorProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => removeWorkItem(ctx.db, input.id)),
});
