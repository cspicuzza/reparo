import { createFileRoute } from '@tanstack/react-router';
import { Vendors } from '@/screens/vendors';

export const Route = createFileRoute('/_app/vendors/')({
  component: Vendors,
});
