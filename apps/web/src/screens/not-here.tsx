import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { FormError } from '@/components/form';
import { LogoMark } from '@/components/logo';
import { PageTitle } from '@/components/page-title';
import { PlanGrid } from '@/components/plan-grid';
import { Button, buttonVariants } from '@/components/ui/button';

/**
 * An address that leads nowhere (Q124): a room outline drawn dashed on the plan grid, like any
 * empty spot in the app, then the way back and the two places people most often meant (OD-136).
 */
function NotHereBody() {
  return (
    <>
      <PageTitle parts={['Not here']} />
      <PlanGrid className="mb-6 h-36 max-w-md rounded-xl">
        <span className="grid h-20 w-32 place-items-center rounded-sm border-2 border-dashed border-muted-foreground">
          Not on the plan
        </span>
      </PlanGrid>
      <h1 className="text-4xl">That page isn&apos;t here.</h1>
      <p className="mt-2 max-w-prose text-muted-foreground">
        The link may be old, or the thing it pointed to was removed.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/" className={buttonVariants()}>
          Go home
        </Link>
        <Link to="/shopping" className={buttonVariants({ variant: 'outline' })}>
          Shopping
        </Link>
        <Link to="/rooms" className={buttonVariants({ variant: 'outline' })}>
          Rooms
        </Link>
      </div>
    </>
  );
}

/** An unknown address inside the signed-in app: shown in the shell, under the bars (Q124). */
export function NotHere() {
  return (
    <section>
      <NotHereBody />
    </section>
  );
}

/** An unknown address outside the shell, such as before signing in (Q124). */
export function NotHerePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16">
      <LogoMark size={40} />
      <div className="mt-6">
        <NotHereBody />
      </div>
    </main>
  );
}

/**
 * The default error page (Q124): something broke while showing a page. Household words, Try
 * again (reloads the page's data and redraws it) and a way Home, instead of the router's bare
 * error text.
 */
export function PageError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <section>
      <PageTitle parts={['Something went wrong']} />
      <h1 className="text-4xl">Something went wrong on this page.</h1>
      <FormError className="mt-3">It didn&apos;t finish showing. Try again, or go home.</FormError>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          Try again
        </Button>
        <Link to="/" className={buttonVariants({ variant: 'outline' })}>
          Go home
        </Link>
      </div>
    </section>
  );
}
