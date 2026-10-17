import { createFileRoute } from '@tanstack/react-router';
import { prefetchRooms } from '@/lib/prefetch';
import { Rooms } from '@/screens/rooms';

export const Route = createFileRoute('/_app/rooms/')({
  loader: prefetchRooms,
  component: Rooms,
});
