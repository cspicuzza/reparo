import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { signOut } from '@/lib/supabase';
import { trpcErrorCode, useTRPC } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

/** Nav entries light up as their milestone lands (M1: Phases, Rooms, Items; Budget is M2). */
const sections: { name: string; to?: '/phases' | '/rooms' | '/items' }[] = [
  { name: 'Phases', to: '/phases' },
  { name: 'Rooms', to: '/rooms' },
  { name: 'Items', to: '/items' },
  { name: 'Budget' },
];

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
              <span className="text-muted-foreground">
                {me.data.member.displayName}
                <span aria-hidden="true"> · </span>
                {me.data.member.role}
              </span>
            ) : null}
            <Button type="button" variant="ghost" onClick={() => void onSignOut()}>
              Sign out
            </Button>
          </div>
        </div>
        <nav aria-label="Sections" className="mx-auto max-w-5xl">
          <ul className="flex gap-5 overflow-x-auto pb-3 text-sm">
            {sections.map(({ name, to }) => (
              <li key={name}>
                {to ? (
                  <Link
                    to={to}
                    className="text-foreground underline-offset-4 hover:underline"
                    activeProps={{ className: 'font-semibold text-foreground' }}
                  >
                    {name}
                  </Link>
                ) : (
                  <span
                    className="text-muted-foreground"
                    title="Coming with its milestone"
                    aria-disabled="true"
                  >
                    {name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="h-px w-full bg-border" aria-hidden="true" />
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
      <p className="mt-4 max-w-prose text-muted-foreground">
        Ask the admin to add it, or sign out and use a different account.
      </p>
      <Button type="button" onClick={() => void onSignOut()} className="mt-10 w-full sm:w-auto">
        Sign out
      </Button>
    </main>
  );
}
