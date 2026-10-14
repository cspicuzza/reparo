import { idSchema, roomCreateSchema, roomUpdateSchema } from '@reparo/shared';
import { z } from 'zod';
import { editorProcedure, memberProcedure, router } from '../trpc';
import {
  createRoom,
  getRoomWithProgress,
  listRooms,
  removeRoom,
  updateRoom,
} from '../services/rooms';

export const roomsRouter = router({
  list: memberProcedure.query(({ ctx }) => listRooms(ctx.db)),
  get: memberProcedure
    .input(z.object({ id: idSchema }))
    .query(({ ctx, input }) => getRoomWithProgress(ctx.db, input.id)),
  create: editorProcedure
    .input(roomCreateSchema)
    .mutation(({ ctx, input }) => createRoom(ctx.db, input)),
  update: editorProcedure
    .input(roomUpdateSchema)
    .mutation(({ ctx, input }) => updateRoom(ctx.db, input)),
  remove: editorProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => removeRoom(ctx.db, input.id)),
});
