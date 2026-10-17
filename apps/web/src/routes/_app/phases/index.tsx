import { createFileRoute } from '@tanstack/react-router';
import { prefetchPhases } from '@/lib/prefetch';
import { parsePhasesSearch } from '@/lib/work';
import { Phases } from '@/screens/phases';

export const Route = createFileRoute('/_app/phases/')({
  validateSearch: parsePhasesSearch,
  loaderDeps: ({ search }) => ({ phase: search.phase }),
  loader: ({ deps }) => prefetchPhases(deps),
  component: Phases,
});
