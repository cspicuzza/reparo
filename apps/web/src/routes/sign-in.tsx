import { createFileRoute, redirect } from '@tanstack/react-router';
import { signInSearchSchema } from '@reparo/shared';
import { supabase } from '@/lib/supabase';
import { authErrorParts } from '@/lib/sign-in-problem';
import { SignIn } from '@/screens/sign-in';

export const Route = createFileRoute('/sign-in')({
  // Google sends people back here (OD-169), with error params when it didn't work. With Zod 4
  // the schema goes straight into validateSearch
  // (https://tanstack.com/router/v1/docs/framework/react/guide/search-params).
  validateSearch: signInSearchSchema,
  beforeLoad: async () => {
    // initialize() hands back what auth-js found on the address, including a failed code
    // exchange that leaves no error params (auth-js 2.117.3; it runs once and is cached).
    const { error } = await supabase.auth.initialize();
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: '/' });
    return { signInError: authErrorParts(error) };
  },
  component: SignIn,
});
