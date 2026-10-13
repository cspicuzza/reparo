import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/lib/supabase';
import { SignIn } from '@/screens/sign-in';

export const Route = createFileRoute('/sign-in')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: '/' });
  },
  component: SignIn,
});
