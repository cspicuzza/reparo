import { createFileRoute } from '@tanstack/react-router';
import { Phases } from '@/screens/phases';

export const Route = createFileRoute('/_app/phases/')({
  component: Phases,
});
