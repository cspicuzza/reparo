import { createFileRoute } from '@tanstack/react-router';
import { parseShoppingSearch } from '@/lib/shopping';
import { Shopping } from '@/screens/shopping';

export const Route = createFileRoute('/_app/shopping/')({
  validateSearch: parseShoppingSearch,
  component: Shopping,
});
