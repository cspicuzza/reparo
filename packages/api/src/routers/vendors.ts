import { idSchema, vendorCreateSchema, vendorListSchema, vendorUpdateSchema } from '@reparo/shared';
import { z } from 'zod';
import { adminProcedure, editorProcedure, memberProcedure, router } from '../trpc';
import {
  archiveVendor,
  createVendor,
  getVendor,
  listVendors,
  restoreVendor,
  updateVendor,
} from '../services/vendors';

/** Vendors (M2). Editors add and edit; archiving (`remove`) and `restore` are admin only. */
export const vendorsRouter = router({
  list: memberProcedure
    .input(vendorListSchema.default({ query: '', includeArchived: false }))
    .query(({ ctx, input }) => listVendors(ctx.db, input)),
  get: memberProcedure
    .input(z.object({ id: idSchema }))
    .query(({ ctx, input }) => getVendor(ctx.db, input.id)),
  create: editorProcedure
    .input(vendorCreateSchema)
    .mutation(({ ctx, input }) => createVendor(ctx.db, input)),
  update: editorProcedure
    .input(vendorUpdateSchema)
    .mutation(({ ctx, input }) => updateVendor(ctx.db, input)),
  remove: adminProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => archiveVendor(ctx.db, input.id)),
  restore: adminProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => restoreVendor(ctx.db, input.id)),
});
