import { createFileRoute } from '@tanstack/react-router';
import { NotHere } from '@/screens/not-here';

// Any address the app doesn't know, inside the signed-in shell (OD-111, Q124).
export const Route = createFileRoute('/_app/$')({
  component: NotHere,
});
