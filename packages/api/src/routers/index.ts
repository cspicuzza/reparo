import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { router } from '../trpc';
import { categoriesRouter } from './categories';
import { healthRouter } from './health';
import { homeRouter } from './home';
import { itemsRouter } from './items';
import { jobRoomsRouter, jobsRouter } from './jobs';
import { phasesRouter } from './phases';
import { roomsRouter } from './rooms';

export const appRouter = router({
  health: healthRouter,
  home: homeRouter,
  phases: phasesRouter,
  rooms: roomsRouter,
  categories: categoriesRouter,
  items: itemsRouter,
  jobs: jobsRouter,
  jobRooms: jobRoomsRouter,
});

export type AppRouter = typeof appRouter;
/** Row shapes as the web receives them (dates are strings over the wire). */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
