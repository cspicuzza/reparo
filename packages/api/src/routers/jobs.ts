import {
  idSchema,
  jobCreateSchema,
  jobListSchema,
  jobRoomCreateSchema,
  jobRoomUpdateSchema,
  jobUpdateSchema,
} from '@reparo/shared';
import { z } from 'zod';
import { editorProcedure, memberProcedure, router } from '../trpc';
import {
  addJobRoom,
  createJob,
  getJob,
  jobsForRoom,
  listJobs,
  removeJob,
  removeJobRoom,
  restoreJob,
  updateJob,
  updateJobRoom,
} from '../services/jobs';

/** Jobs with their rooms and progress. `list({ itemId })` is the item view across phases. */
export const jobsRouter = router({
  list: memberProcedure
    .input(jobListSchema.default({}))
    .query(({ ctx, input }) => listJobs(ctx.db, input)),
  get: memberProcedure
    .input(z.object({ id: idSchema }))
    .query(({ ctx, input }) => getJob(ctx.db, input.id)),
  /** The room view: the jobs covering one room, with that room's status and spec. */
  forRoom: memberProcedure
    .input(z.object({ roomId: idSchema }))
    .query(({ ctx, input }) => jobsForRoom(ctx.db, input.roomId)),
  create: editorProcedure
    .input(jobCreateSchema)
    .mutation(({ ctx, input }) => createJob(ctx.db, input)),
  update: editorProcedure
    .input(jobUpdateSchema)
    .mutation(({ ctx, input }) => updateJob(ctx.db, input)),
  remove: editorProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => removeJob(ctx.db, input.id)),
  restore: editorProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => restoreJob(ctx.db, input.id)),
});

/** The rooms a job covers. Each mutation returns the whole job, refreshed. */
export const jobRoomsRouter = router({
  create: editorProcedure
    .input(jobRoomCreateSchema)
    .mutation(({ ctx, input }) => addJobRoom(ctx.db, input)),
  update: editorProcedure
    .input(jobRoomUpdateSchema)
    .mutation(({ ctx, input }) => updateJobRoom(ctx.db, input)),
  remove: editorProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => removeJobRoom(ctx.db, input.id)),
});
