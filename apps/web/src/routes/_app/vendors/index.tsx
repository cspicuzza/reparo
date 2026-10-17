import { createFileRoute } from '@tanstack/react-router';
import { prefetchVendors } from '@/lib/prefetch';
import { parseVendorsSearch } from '@/lib/vendors';
import { Vendors } from '@/screens/vendors';

export const Route = createFileRoute('/_app/vendors/')({
  validateSearch: parseVendorsSearch,
  loader: prefetchVendors,
  component: Vendors,
});
