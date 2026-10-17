import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/lib/supabase';
import { queryClient, trpcOptions } from '@/lib/trpc';
import { NotHere } from '@/screens/not-here';
import { Shell } from '@/screens/shell';

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: '/sign-in' });
    // Know who's signed in before the page draws, so editing controls don't appear a moment
    // after it, and a viewer never sees them flash (OD-145). A failure is the shell's to show.
    await queryClient
      .ensureQueryData(trpcOptions.health.ping.queryOptions())
      .catch(() => undefined);
  },
  component: Shell,
  notFoundComponent: NotHere,
});
