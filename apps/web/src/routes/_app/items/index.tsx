import { createFileRoute } from '@tanstack/react-router';
import { Items } from '@/screens/items';

export const Route = createFileRoute('/_app/items/')({
  component: Items,
});
