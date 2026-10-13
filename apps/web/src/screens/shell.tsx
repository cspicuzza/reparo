import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { signOut } from '@/lib/supabase';
import { trpcErrorCode, useTRPC } from '@/lib/trpc';

const sections = ['Phases', 'Rooms', 'Items', 'Budget'] as const;

export function Shell() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const me = useQuery(trpc.health.ping.queryOptions());

  async function onSignOut() {
    await signOut();
    await navigate({ to: '/sign-in' });
  }

  if (trpcErrorCode(me.error) === 'FORBIDDEN') {
    return <NotAMember onSignOut={onSignOut} />;
  }

  return (
    <div className="min-h-dvh">
      <header className="px-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 py-4">
          <Link to="/" className="text-xl font-semibold tracking-tight">
            Reparo
          </Link>
          <div className="flex items-center gap-4 text-sm">
            {me.data ? (
              <span className="text-pencil">
                {me.data.member.displayName}
                <span aria-hidden="true"> · </span>
                {me.data.member.role}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="rounded-md px-2 py-1 text-ink underline-offset-4 hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav aria-label="Sections" className="mx-auto max-w-5xl">
          <ul className="flex gap-5 overflow-x-auto pb-3 text-sm">
            {sections.map((name) => (
              <li key={name}>
                <span
                  className="text-pencil"
                  title="Coming with its milestone"
                  aria-disabled="true"
                >
                  {name}
                </span>
              </li>
            ))}
          </ul>
        </nav>
        <div className="h-px w-full bg-chalk" aria-hidden="true" />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

export function NotAMember({ onSignOut }: { onSignOut: () => Promise<void> }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        This Google account isn&apos;t on the household list.
      </h1>
      <p className="mt-4 max-w-prose text-pencil">
        Ask the admin to add it, or sign out and use a different account.
      </p>
      <button
        type="button"
        onClick={() => void onSignOut()}
        className="mt-10 w-full rounded-md bg-moss px-5 py-3 text-left text-base font-medium text-paper hover:bg-moss-deep sm:w-auto"
      >
        Sign out
      </button>
    </main>
  );
}
