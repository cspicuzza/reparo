import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/trpc';
import './index.css';

const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Re-run route guards and refetch when the session changes (sign-in return, sign-out, refresh).
supabase.auth.onAuthStateChange(() => {
  void queryClient.invalidateQueries();
  void router.invalidate();
});

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
