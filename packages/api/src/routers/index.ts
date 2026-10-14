import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { router } from '../trpc';
import { categoriesRouter } from './categories';
import { healthRouter } from './health';
import { itemsRouter } from './items';
import { jobRoomsRouter, jobsRouter } from './jobs';
import { phasesRouter } from './phases';
import { roomsRouter } from './rooms';
import { workItemsRouter } from './work-items';

export const appRouter = router({
  health: healthRouter,
  phases: phasesRouter,
  rooms: roomsRouter,
  categories: categoriesRouter,
  items: itemsRouter,
  jobs: jobsRouter,
  jobRooms: jobRoomsRouter,
  /** Replaced by jobs; removed in OD-35 with the work_items table. */
  workItems: workItemsRouter,
});

export type AppRouter = typeof appRouter;
/** Row shapes as the web receives them (dates are strings over the wire). */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
