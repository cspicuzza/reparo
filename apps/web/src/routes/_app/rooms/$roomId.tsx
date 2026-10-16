import { createFileRoute } from '@tanstack/react-router';
import { prefetchRoom } from '@/lib/prefetch';
import { RoomDetail } from '@/screens/room';

export const Route = createFileRoute('/_app/rooms/$roomId')({
  // Starts every section's data at once, without holding the page back (OD-115, Q137).
  loader: ({ params }) => prefetchRoom(params.roomId),
  component: RoomDetail,
});
