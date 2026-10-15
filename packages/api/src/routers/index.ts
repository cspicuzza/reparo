import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { router } from '../trpc';
import { healthRouter } from './health';
import { homeRouter } from './home';
import { jobRoomsRouter, jobsRouter } from './jobs';
import {
  budgetAdjustmentsRouter,
  budgetRouter,
  categoriesRouter,
  costLinesRouter,
  moneyRouter,
  paymentsRouter,
  shoppingLinesRouter,
} from './money';
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
  categories: categoriesRouter,
  shoppingLines: shoppingLinesRouter,
  costLines: costLinesRouter,
  payments: paymentsRouter,
  budget: budgetRouter,
  budgetAdjustments: budgetAdjustmentsRouter,
  money: moneyRouter,
});

export type AppRouter = typeof appRouter;
/** Row shapes as the web receives them (dates are strings over the wire). */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
