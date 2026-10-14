import { router } from '../trpc';
import { healthRouter } from './health';
import { itemsRouter } from './items';
import { phasesRouter } from './phases';
import { roomsRouter } from './rooms';
import { workItemsRouter } from './work-items';

export const appRouter = router({
  health: healthRouter,
  phases: phasesRouter,
  rooms: roomsRouter,
  items: itemsRouter,
  workItems: workItemsRouter,
});

export type AppRouter = typeof appRouter;
