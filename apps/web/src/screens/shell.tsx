import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { House, LayoutGrid, List, LogOut } from 'lucide-react';
import type { ComponentType } from 'react';
import { LogoMark } from '@/components/logo';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/lib/supabase';
import { trpcErrorCode, useTRPC } from '@/lib/trpc';

type Section = {
  name: string;
  to: '/' | '/rooms' | '/items' | '/phases';
  icon?: ComponentType<{ 'aria-hidden'?: boolean }>;
  /** Phones reach Phases from Home; the bottom bar keeps to the places used every day. */
  phone: boolean;
};

/** Money joins both bars when M2 builds it; until then it isn't shown (no dead links). */
const sections: Section[] = [
  { name: 'Home', to: '/', icon: House, phone: true },
  { name: 'Rooms', to: '/rooms', icon: LayoutGrid, phone: true },
  { name: 'Items', to: '/items', icon: List, phone: true },
  { name: 'Phases', to: '/phases', phone: false },
];

const ROLE_LABEL = { admin: 'Admin', editor: 'Can edit', viewer: 'Can view' } as const;

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
      <header className="border-b border-border bg-bar">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <Link
            to="/"
            className="-ml-1 inline-flex min-h-11 items-center gap-2.5 rounded-lg px-1 text-2xl font-[640] tracking-tight [font-stretch:74%]"
          >
            <LogoMark mends />
            Reparo
          </Link>
          <nav aria-label="Sections" className="hidden sm:block">
            <ul className="flex items-center gap-1">
              {sections.map(({ name, to }) => (
                <li key={name}>
                  <Link
                    to={to}
                    activeOptions={{ exact: to === '/' }}
                    className="inline-flex min-h-11 items-center px-3.5 text-muted-foreground hover:text-foreground"
                    activeProps={{
                      className:
                        'font-semibold text-foreground! shadow-[inset_0_-3px_0_var(--tape)]',
                      'aria-current': 'page',
                    }}
                  >
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {me.data ? (
            <DropdownMenu>
              <DropdownMenuTrigger className={buttonVariants({ variant: 'outline' })}>
                {me.data.member.displayName}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    Signed in as {me.data.member.displayName}
                    <span className="block">{ROLE_LABEL[me.data.member.role]}</span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void onSignOut()}>
                  <LogOut aria-hidden />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="min-h-11" aria-hidden="true" />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-8 pb-28 sm:px-6 sm:pb-16">
        <Outlet />
      </main>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bar pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_18px_rgb(0_0_0/0.08)] sm:hidden"
      >
        <ul className="flex">
          {sections
            .filter((s) => s.phone)
            .map(({ name, to, icon: Icon }) => (
              <li key={name} className="flex-1">
                <Link
                  to={to}
                  activeOptions={{ exact: to === '/' }}
                  className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-sm text-muted-foreground [&_svg]:size-6"
                  activeProps={{
                    className: 'font-semibold text-foreground! shadow-[inset_0_3px_0_var(--tape)]',
                    'aria-current': 'page',
                  }}
                >
                  {Icon ? <Icon aria-hidden /> : null}
                  {name}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </div>
  );
}

export function NotAMember({ onSignOut }: { onSignOut: () => Promise<void> }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16">
      <LogoMark size={40} />
      <h1 className="mt-6 text-3xl">This Google account isn&apos;t on the household list.</h1>
      <p className="mt-4 max-w-prose text-muted-foreground">
        Ask the admin to add it, or sign out and use a different account.
      </p>
      <Button type="button" onClick={() => void onSignOut()} className="mt-10 w-full sm:w-auto">
        Sign out
      </Button>
    </main>
  );
}
