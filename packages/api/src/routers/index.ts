import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
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
/** Row shapes as the web receives them (dates are strings over the wire). */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
