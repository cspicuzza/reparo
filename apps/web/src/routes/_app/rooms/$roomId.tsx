import { createFileRoute } from '@tanstack/react-router';
import { RoomDetail } from '@/screens/room';

export const Route = createFileRoute('/_app/rooms/$roomId')({
  component: RoomDetail,
});
