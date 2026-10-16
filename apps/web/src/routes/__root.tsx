import { QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { ThemeSync } from '@/components/theme-sync';
import { Toaster, ToastProvider } from '@/components/ui/toast';
import { queryClient, trpcClient, TRPCProvider } from '@/lib/trpc';
import { NotHerePage } from '@/screens/not-here';

export const Route = createRootRoute({
  // Outside the signed-in shell (Q124); inside it, /_app's own page is used.
  notFoundComponent: NotHerePage,
  component: () => (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <ToastProvider limit={3}>
          <Outlet />
          <Toaster />
          <ThemeSync />
        </ToastProvider>
      </TRPCProvider>
    </QueryClientProvider>
  ),
});
