import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import {
  CalendarRange,
  CircleUserRound,
  Contact,
  Hammer,
  House,
  LayoutGrid,
  Menu as MenuIcon,
  ShoppingBag,
  Wallet,
} from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType } from 'react';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { signOut } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { trpcErrorCode, useTRPC } from '@/lib/trpc';
import { ThemeSwitch, ThemeSwitchMenu } from '@/components/theme-switch';
import { PreviewBar, ViewAsMenu, ViewAsSwitch } from '@/components/view-as';
import { useMe } from '@/lib/me';

type Path = '/' | '/rooms' | '/jobs' | '/shopping' | '/money' | '/phases' | '/vendors' | '/manage';
type Section = { name: string; to: Path; icon: ComponentType<{ 'aria-hidden'?: boolean }> };

/*
 * Navigation (OD-48, Q25/Q27). Laptop: one top bar. Phone: the places used every day stay
 * visible in the bottom bar, the rest sit in a slide-out Menu panel (hidden navigation is used
 * less, so only the less-used sections go there). Home carries the money headline on phones;
 * the Money page is in the panel. Vendors is reached from the Jobs page on a laptop.
 */
const HOME: Section = { name: 'Home', to: '/', icon: House };
const ROOMS: Section = { name: 'Rooms', to: '/rooms', icon: LayoutGrid };
const JOBS: Section = { name: 'Jobs', to: '/jobs', icon: Hammer };
const SHOPPING: Section = { name: 'Shopping', to: '/shopping', icon: ShoppingBag };
const MONEY: Section = { name: 'Money', to: '/money', icon: Wallet };
const PHASES: Section = { name: 'Phases', to: '/phases', icon: CalendarRange };
const VENDORS: Section = { name: 'Vendors', to: '/vendors', icon: Contact };

const TOP_BAR = [HOME, ROOMS, JOBS, SHOPPING, MONEY, PHASES];
const BOTTOM_BAR = [HOME, ROOMS, JOBS, SHOPPING];
const MENU_PANEL = [MONEY, PHASES, VENDORS];

/** Whether `pathname` is inside `to` (Home only matches itself). */
const isIn = (pathname: string, to: Path) =>
  to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);

const ROLE_LABEL = { admin: 'Admin', editor: 'Can edit', viewer: 'Can view' } as const;

/**
 * After moving to another page (not on first load, and not when only the search changes),
 * focus the new page's heading so screen readers announce it (OD-111, Q123). Runs once the
 * router has drawn the new page; one that's still loading has no heading yet, so this waits up
 * to two seconds for it to appear.
 */
function useFocusHeadingOnNavigate() {
  const router = useRouter();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let stopWaiting = () => {};
    const unsubscribe = router.subscribe('onRendered', (event) => {
      if (!event.fromLocation || !event.pathChanged) return;
      stopWaiting();
      const main = mainRef.current;
      if (!main) return;
      const focus = () => {
        const h1 = main.querySelector('h1');
        if (!h1) return false;
        h1.tabIndex = -1;
        h1.focus({ preventScroll: true });
        return true;
      };
      if (focus()) return;
      const observer = new MutationObserver(() => {
        if (focus()) stopWaiting();
      });
      observer.observe(main, { childList: true, subtree: true });
      const timer = window.setTimeout(() => observer.disconnect(), 2000);
      stopWaiting = () => {
        observer.disconnect();
        window.clearTimeout(timer);
      };
    });
    return () => {
      unsubscribe();
      stopWaiting();
    };
  }, [router]);
  return mainRef;
}

export function Shell() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const me = useQuery(trpc.health.ping.queryOptions());
  const { role, isAdmin } = useMe();
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const onManage = isIn(pathname, '/manage');
  const mainRef = useFocusHeadingOnNavigate();

  async function onSignOut() {
    await signOut();
    await navigate({ to: '/sign-in' });
  }

  if (trpcErrorCode(me.error) === 'FORBIDDEN') {
    return <NotAMember onSignOut={onSignOut} />;
  }

  return (
    <div className="min-h-dvh">
      <PreviewBar />
      <header className="border-b border-border bg-bar">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <Link
            to="/"
            className="-ml-1 inline-flex min-h-11 items-center gap-2.5 rounded-lg px-1 text-2xl font-[640] tracking-tight [font-stretch:74%]"
          >
            <LogoMark mends />
            Reparo
          </Link>
          <nav aria-label="Sections" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {TOP_BAR.map(({ name, to }) => {
                // Vendors has no tab on a laptop; it's reached from Jobs, so Jobs is the
                // current section there (OD-112, Q126).
                const current =
                  isIn(pathname, to) || (to === '/jobs' && isIn(pathname, '/vendors'));
                return (
                  <li key={name}>
                    <Link
                      to={to}
                      className={cn(
                        'inline-flex min-h-11 items-center px-3.5 text-muted-foreground hover:text-foreground',
                        current &&
                          'font-semibold text-foreground! shadow-[inset_0_-3px_0_var(--tape)]',
                      )}
                      aria-current={current ? (pathname === to ? 'page' : 'true') : undefined}
                    >
                      {name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {me.data ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                // Borderless: it reads as "you" rather than an action (OD-135, Q201).
                className={buttonVariants({
                  variant: 'ghost',
                  className: cn(
                    'hidden pl-2.5 md:inline-flex',
                    // On /manage the account menu holds the current page (Q128).
                    onManage && 'shadow-[inset_0_-3px_0_var(--tape)]',
                  ),
                })}
              >
                {/* A plain person icon, the same for everyone (OD-134, Q198–Q199). */}
                <CircleUserRound aria-hidden className="size-7" strokeWidth={1.5} />
                {me.data.member.displayName}
              </DropdownMenuTrigger>
              {/* Wide enough for the longest Appearance wording, so switching it doesn't
                  change the menu's width (OD-132, Q191). */}
              <DropdownMenuContent className="min-w-80">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    Signed in as {me.data.member.displayName}
                    <span className="block">{ROLE_LABEL[role ?? me.data.member.role]}</span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <ThemeSwitchMenu />
                <ViewAsMenu />
                <DropdownMenuSeparator />
                {isAdmin ? (
                  <DropdownMenuItem
                    onClick={() => void navigate({ to: '/manage' })}
                    aria-current={onManage ? 'page' : undefined}
                    className={cn(onManage && 'font-semibold shadow-[inset_3px_0_0_var(--tape)]')}
                  >
                    Manage lists
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => void onSignOut()}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="hidden min-h-11 md:block" aria-hidden="true" />
          )}
        </div>
      </header>

      <main ref={mainRef} className="mx-auto max-w-6xl px-4 pt-8 pb-28 sm:px-6 md:pb-16">
        <Outlet />
      </main>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bar pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_18px_var(--float-shadow)] md:hidden"
      >
        <ul className="flex">
          {BOTTOM_BAR.map(({ name, to, icon: Icon }) => (
            <li key={name} className="flex-1">
              <Link
                to={to}
                activeOptions={{ exact: to === '/' }}
                className={TAB_CLASS}
                activeProps={{
                  className: TAB_ACTIVE_CLASS,
                  'aria-current': 'page',
                }}
              >
                <Icon aria-hidden />
                {name}
              </Link>
            </li>
          ))}
          <li className="flex-1">
            <MenuPanel member={me.data?.member} onSignOut={onSignOut} />
          </li>
        </ul>
      </nav>
    </div>
  );
}

const TAB_CLASS =
  'flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-sm text-muted-foreground [&_svg]:size-6';
const TAB_ACTIVE_CLASS = 'font-semibold text-foreground! shadow-[inset_0_3px_0_var(--tape)]';

/**
 * The phone's Menu tab and the panel it slides out: the less-used sections and the account.
 * The tab carries the current-page marker while one of the panel's pages is open.
 */
function MenuPanel({
  member,
  onSignOut,
}: {
  member: { displayName: string; role: keyof typeof ROLE_LABEL } | undefined;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const { role, isAdmin } = useMe();
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  // Manage lists lives in this panel too, so the tab is current there (Q128).
  const here = MENU_PANEL.some((sec) => isIn(pathname, sec.to)) || isIn(pathname, '/manage');

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={cn(TAB_CLASS, here && TAB_ACTIVE_CLASS)}>
        <MenuIcon aria-hidden />
        Menu
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav aria-label="More sections" className="px-2">
          <ul>
            {MENU_PANEL.map(({ name, to, icon: Icon }) => (
              <li key={name}>
                <Link
                  to={to}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-lg text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-6"
                  activeProps={{
                    className: 'font-semibold text-foreground! shadow-[inset_3px_0_0_var(--tape)]',
                    'aria-current': 'page',
                  }}
                >
                  <Icon aria-hidden />
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {member ? (
          <div className="mt-auto border-t border-border px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {/* The same person icon as the laptop's account button (OD-134, Q200). */}
            <div className="flex items-center gap-3">
              <CircleUserRound aria-hidden className="size-7 shrink-0" strokeWidth={1.5} />
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Signed in as</p>
                <p className="font-semibold">{member.displayName}</p>
                <p className="text-sm text-muted-foreground">{ROLE_LABEL[role ?? member.role]}</p>
              </div>
            </div>
            <ThemeSwitch className="mt-4" />
            <ViewAsSwitch className="mt-4" />
            {isAdmin ? (
              <Link
                to="/manage"
                onClick={() => setOpen(false)}
                className={buttonVariants({ variant: 'outline', className: 'mt-3 w-full' })}
                activeProps={{
                  className: 'font-semibold shadow-[inset_3px_0_0_var(--tape)]',
                  'aria-current': 'page',
                }}
              >
                Manage lists
              </Link>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full"
              onClick={() => {
                setOpen(false);
                void onSignOut();
              }}
            >
              Sign out
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
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
      <Button
        type="button"
        onClick={() => void onSignOut()}
        className="mt-10 w-full sm:w-auto sm:self-start"
      >
        Sign out
      </Button>
    </main>
  );
}
