import { useQueryClient } from '@tanstack/react-query';
import { useTRPC } from './trpc';

/** Everything buying, returning or editing a line can move. */
export function useInvalidateShopping() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.shoppingLines.pathFilter()),
      queryClient.invalidateQueries(trpc.categories.pathFilter()),
      queryClient.invalidateQueries(trpc.money.pathFilter()),
      queryClient.invalidateQueries(trpc.home.pathFilter()),
    ]);
}
