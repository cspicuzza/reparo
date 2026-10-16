import { useState } from 'react';
import { FormError } from '@/components/form';
import { LogoMark } from '@/components/logo';
import { PageTitle } from '@/components/page-title';
import { Button } from '@/components/ui/button';
import { signInWithGoogle } from '@/lib/supabase';

export function SignIn() {
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    }
  }

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
      {error ? (
        <FormError className="mt-6">Sign-in didn&apos;t start: {error}. Try again.</FormError>
      ) : null}
    </main>
  );
}
