import { useState } from 'react';
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
      <h1 className="text-5xl font-semibold tracking-tight">Reparo</h1>
      <p className="mt-3 max-w-prose text-lg text-pencil">The house, in order.</p>
      <div className="mt-10 h-px w-full bg-chalk" aria-hidden="true" />
      <button
        type="button"
        onClick={() => void onClick()}
        className="mt-10 w-full rounded-md bg-moss px-5 py-3 text-left text-base font-medium text-paper transition-colors hover:bg-moss-deep sm:w-auto"
      >
        Continue with Google
      </button>
      <p className="mt-4 text-sm text-pencil">Household members only.</p>
      {error ? (
        <p role="alert" className="mt-6 text-sm text-ink">
          Sign-in didn&apos;t start: {error}
        </p>
      ) : null}
    </main>
  );
}
