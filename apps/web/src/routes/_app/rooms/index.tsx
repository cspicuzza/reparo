import { createFileRoute } from '@tanstack/react-router';
import { Rooms } from '@/screens/rooms';

export const Route = createFileRoute('/_app/rooms/')({
  component: Rooms,
});
