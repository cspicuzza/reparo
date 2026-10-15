import { QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { CalmThemeSwitch } from '@/components/calm-theme-switch';
import { Toaster, ToastProvider } from '@/components/ui/toast';
import { queryClient, trpcClient, TRPCProvider } from '@/lib/trpc';

export const Route = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <ToastProvider limit={3}>
          <Outlet />
          <Toaster />
          <CalmThemeSwitch />
        </ToastProvider>
      </TRPCProvider>
    </QueryClientProvider>
  ),
});
