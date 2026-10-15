import {
  fileFinishSchema,
  fileListManySchema,
  fileListSchema,
  fileStartSchema,
  fileUpdateSchema,
  idSchema,
} from '@reparo/shared';
import { z } from 'zod';
import { editorProcedure, memberProcedure, router } from '../trpc';
import {
  finishUpload,
  listFiles,
  listJobProgressPhotos,
  listManyFiles,
  listRoomCovers,
  removeFile,
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
});
