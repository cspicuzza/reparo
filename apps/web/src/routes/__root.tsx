import { QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Toaster, ToastProvider } from '@/components/ui/toast';
import { queryClient, trpcClient, TRPCProvider } from '@/lib/trpc';

export const Route = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <ToastProvider limit={3}>
          <Outlet />
          <Toaster />
        </ToastProvider>
      </TRPCProvider>
    </QueryClientProvider>
  ),
});
