import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/trpc';
import { PageError } from '@/screens/not-here';
import './index.css';

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  // Something that breaks while showing a page gets Reparo's words, not the router's (Q124).
  defaultErrorComponent: PageError,
  // TanStack Query owns freshness: the router always runs a loader on preload or visit, and
  // the query decides whether that fetches (OD-154,
  // https://tanstack.com/router/latest/docs/guide/data-loading).
  defaultPreloadStaleTime: 0,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Re-run route guards and refetch only when who's signed in changes: signing in as someone,
// or signing out (OD-115, Q136). Not on the hourly TOKEN_REFRESHED, which used to refetch
// everything and re-sign every picture link. SIGNED_IN also fires "when refocusing a tab"
// (@supabase/auth-js 2.117.3 onAuthStateChange docs, read from node_modules), so it only counts
// when the user is a different one.
let signedInAs: string | null = null;
supabase.auth.onAuthStateChange((event, session) => {
  const who = session?.user.id ?? null;
  const changed = who !== signedInAs;
  signedInAs = who;
  if (event === 'INITIAL_SESSION') return;
  if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && changed)) {
    void queryClient.invalidateQueries();
    void router.invalidate();
  }
});

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
