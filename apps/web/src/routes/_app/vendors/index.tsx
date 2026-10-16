import { createFileRoute } from '@tanstack/react-router';
import { parseVendorsSearch } from '@/lib/vendors';
import { Vendors } from '@/screens/vendors';

export const Route = createFileRoute('/_app/vendors/')({
  validateSearch: parseVendorsSearch,
  component: Vendors,
});
