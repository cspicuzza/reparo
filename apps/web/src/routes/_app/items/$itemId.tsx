import { createFileRoute } from '@tanstack/react-router';
import { ItemDetail } from '@/screens/item';

export const Route = createFileRoute('/_app/items/$itemId')({
  component: ItemDetail,
});
