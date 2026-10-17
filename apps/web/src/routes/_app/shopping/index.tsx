import { createFileRoute } from '@tanstack/react-router';
import { prefetchShopping, shoppingDeps } from '@/lib/prefetch';
import { parseShoppingSearch } from '@/lib/shopping';
import { Shopping } from '@/screens/shopping';

export const Route = createFileRoute('/_app/shopping/')({
  validateSearch: parseShoppingSearch,
  // Only the filters, not the open item (`line`), so opening one doesn't rerun this (OD-154).
  loaderDeps: ({ search }) => shoppingDeps(search),
  loader: ({ deps }) => prefetchShopping(deps),
  component: Shopping,
});
