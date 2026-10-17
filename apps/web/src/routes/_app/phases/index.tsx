import { createFileRoute } from '@tanstack/react-router';
import { parsePhasesSearch } from '@/lib/work';
import { Phases } from '@/screens/phases';

export const Route = createFileRoute('/_app/phases/')({
  validateSearch: parsePhasesSearch,
  component: Phases,
});
