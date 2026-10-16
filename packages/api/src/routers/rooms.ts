import {
  idSchema,
  moveSchema,
  roomCoverSchema,
  roomCreateSchema,
  roomUpdateSchema,
} from '@reparo/shared';
import { z } from 'zod';
import { editorProcedure, memberProcedure, router } from '../trpc';
import {
  createRoom,
  getRoomWithProgress,
  listRoomsWithProgress,
  moveRoom,
  removeRoom,
  restoreRoom,
  updateRoom,
} from '../services/rooms';
import { setRoomCover } from '../services/files';

export const roomsRouter = router({
  list: memberProcedure.query(({ ctx }) => listRoomsWithProgress(ctx.db)),
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
  /** One place up or down the list (OD-117, Q141). */
  move: editorProcedure.input(moveSchema).mutation(({ ctx, input }) => moveRoom(ctx.db, input)),
  /** Undo for remove (OD-113, Q142). */
  restore: editorProcedure
    .input(z.object({ id: idSchema }))
    .mutation(({ ctx, input }) => restoreRoom(ctx.db, input.id)),
  /** One of the room's renderings as its cover, or none (M4, Q16). */
  setCover: editorProcedure
    .input(roomCoverSchema)
    .mutation(({ ctx, input }) => setRoomCover(ctx.db, input)),
});
