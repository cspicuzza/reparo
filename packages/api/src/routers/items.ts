import { idSchema, itemCreateSchema, itemUpdateSchema } from '@reparo/shared';
import { z } from 'zod';
import { adminProcedure, memberProcedure, router } from '../trpc';
import { createItem, getItem, listItems, updateItem } from '../services/items';

/** The item catalog is admin-managed (ADR-008). No delete: items retire via `update`. */
export const itemsRouter = router({
  list: memberProcedure
    .input(
      z.object({ includeRetired: z.boolean().default(false) }).default({ includeRetired: false }),
    )
    .query(({ ctx, input }) => listItems(ctx.db, input)),
  get: memberProcedure
    .input(z.object({ id: idSchema }))
    .query(({ ctx, input }) => getItem(ctx.db, input.id)),
  create: adminProcedure
    .input(itemCreateSchema)
    .mutation(({ ctx, input }) => createItem(ctx.db, input)),
  update: adminProcedure
    .input(itemUpdateSchema)
    .mutation(({ ctx, input }) => updateItem(ctx.db, input)),
});
