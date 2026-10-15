import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { router } from '../trpc';
import { healthRouter } from './health';
import { homeRouter } from './home';
import { jobRoomsRouter, jobsRouter } from './jobs';
import { phasesRouter } from './phases';
import { roomsRouter } from './rooms';
import { vendorsRouter } from './vendors';

export const appRouter = router({
  health: healthRouter,
  home: homeRouter,
  phases: phasesRouter,
  rooms: roomsRouter,
  jobs: jobsRouter,
  jobRooms: jobRoomsRouter,
  vendors: vendorsRouter,
});

export type AppRouter = typeof appRouter;
/** Row shapes as the web receives them (dates are strings over the wire). */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
