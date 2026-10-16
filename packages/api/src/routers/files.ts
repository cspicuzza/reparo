import {
  fileFinishSchema,
  fileListManySchema,
  fileListSchema,
  fileStartSchema,
  fileThumbSchema,
  fileUpdateSchema,
  idSchema,
} from '@reparo/shared';
import { z } from 'zod';
import { adminProcedure, editorProcedure, memberProcedure, router } from '../trpc';
import {
  finishThumb,
  finishUpload,
  listFiles,
  listPicturesWithoutThumbs,
  listJobProgressPhotos,
  listManyFiles,
  listRoomCovers,
  removeFile,
  startThumb,
  startUpload,
  updateFile,
} from '../services/files';

/**
 * Files (M4). Uploading is two calls around the browser's own PUT to storage: `uploadLink`
 * checks and hands out a link, `create` records what arrived. Editors write; viewers read.
 */
export const filesRouter = router({
  list: memberProcedure
    .input(fileListSchema)
    .query(({ ctx, input }) => listFiles(ctx.db, ctx.storage, input)),
  listMany: memberProcedure
    .input(fileListManySchema)
    .query(({ ctx, input }) => listManyFiles(ctx.db, ctx.storage, input)),
  /** Progress photos tagged with a job, for its page. */
  forJob: memberProcedure
    .input(z.object({ jobId: idSchema }))
    .query(({ ctx, input }) => listJobProgressPhotos(ctx.db, ctx.storage, input.jobId)),
  /** Every room's cover, for the Rooms list. */
  roomCovers: memberProcedure.query(({ ctx }) => listRoomCovers(ctx.db, ctx.storage)),
  uploadLink: editorProcedure
    .input(fileStartSchema)
    .mutation(({ ctx, input }) => startUpload(ctx.db, ctx.storage, input)),
  create: editorProcedure
    .input(fileFinishSchema)
    .mutation(({ ctx, input }) => finishUpload(ctx.db, ctx.storage, ctx.member.id, input)),
  update: editorProcedure
    .input(fileUpdateSchema)
    .mutation(({ ctx, input }) => updateFile(ctx.db, input)),
  remove: editorProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => removeFile(ctx.db, input.id)),
  /** Pictures from before thumbnails, for the admin's backfill in Manage (OD-115, Q170). */
  withoutThumbs: adminProcedure.query(({ ctx }) => listPicturesWithoutThumbs(ctx.db, ctx.storage)),
  thumbLink: adminProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => startThumb(ctx.db, ctx.storage, input.id)),
  setThumb: adminProcedure
    .input(fileThumbSchema)
    .mutation(({ ctx, input }) => finishThumb(ctx.db, ctx.storage, input)),
});
