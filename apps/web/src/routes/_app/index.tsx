import { createFileRoute } from '@tanstack/react-router';
import { prefetchHome } from '@/lib/prefetch';
import { Home } from '@/screens/home';

export const Route = createFileRoute('/_app/')({
  loader: prefetchHome,
  component: Home,
});
