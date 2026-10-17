import { useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { FormError } from '@/components/form';
import { LogoMark } from '@/components/logo';
import { PageTitle } from '@/components/page-title';
import { Button } from '@/components/ui/button';
import { SIGN_IN_START_PROBLEM, signInProblem } from '@/lib/sign-in-problem';
import { signInWithGoogle } from '@/lib/supabase';

const route = getRouteApi('/sign-in');

export function SignIn() {
  const search = route.useSearch();
  const { signInError } = route.useRouteContext();
  const [startFailed, setStartFailed] = useState(false);
  // Why the last try came back here, if it did (OD-169): the address first, else what auth-js saw.
  const cameBack = signInProblem({
    error: search.error ?? signInError.error,
    code: search.error_code ?? signInError.code,
  });

  async function onClick() {
    setStartFailed(false);
    try {
      await signInWithGoogle();
    } catch {
      setStartFailed(true);
    }
  }

  const problem = startFailed ? SIGN_IN_START_PROBLEM : cameBack;
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16">
      <PageTitle parts={['Sign in']} />
      <LogoMark size={48} />
      <h1 className="mt-6 text-4xl">Reparo</h1>
      <p className="mt-2 max-w-prose text-xl text-muted-foreground">The house, in order.</p>
      <div className="mt-10 h-px w-full bg-border" aria-hidden="true" />
      <Button
        type="button"
        onClick={() => void onClick()}
        className="mt-10 w-full sm:w-auto sm:self-start"
      >
        Continue with Google
      </Button>
      <p className="mt-4 text-sm text-muted-foreground">Household members only.</p>
      {problem ? <FormError className="mt-6">{problem}</FormError> : null}
    </main>
  );
}
