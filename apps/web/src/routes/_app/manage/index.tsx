import { createFileRoute } from '@tanstack/react-router';
import { ManageLists } from '@/screens/manage-lists';

export const Route = createFileRoute('/_app/manage/')({
  component: ManageLists,
});
