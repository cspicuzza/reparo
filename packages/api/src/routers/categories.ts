import { memberProcedure, router } from '../trpc';
import { listCategories } from '../services/categories';

export const categoriesRouter = router({
  list: memberProcedure.query(({ ctx }) => listCategories(ctx.db)),
});
