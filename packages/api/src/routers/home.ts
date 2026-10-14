import { memberProcedure, router } from '../trpc';
import { homeSummary } from '../services/home';

export const homeRouter = router({
  summary: memberProcedure.query(({ ctx }) => homeSummary(ctx.db)),
});
