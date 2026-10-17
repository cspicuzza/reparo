import { createFileRoute } from '@tanstack/react-router';
import { prefetchMoney } from '@/lib/prefetch';
import { Money } from '@/screens/money';

export const Route = createFileRoute('/_app/money/')({
  loader: prefetchMoney,
  component: Money,
});
