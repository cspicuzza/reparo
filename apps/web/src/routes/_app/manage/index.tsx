import { createFileRoute } from '@tanstack/react-router';
import { prefetchManage } from '@/lib/prefetch';
import { ManageLists } from '@/screens/manage-lists';

export const Route = createFileRoute('/_app/manage/')({
  loader: prefetchManage,
  component: ManageLists,
});
