import { createFileRoute } from '@tanstack/react-router';
import { Money } from '@/screens/money';

export const Route = createFileRoute('/_app/money/')({
  component: Money,
});
