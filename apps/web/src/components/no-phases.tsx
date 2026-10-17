import { Link } from '@tanstack/react-router';
import { useMe } from '@/lib/me';

/**
 * A form that needs a phase, before there is one (OD-145). Only an admin can add phases, so only
 * an admin is sent to the Phases page; everyone else is told who can.
 */
export function NoPhases({ what }: { what: string }) {
  const { isAdmin } = useMe();
  return (
    <p role="alert">
      {isAdmin ? (
        <>
          Add a phase first on the{' '}
          <Link to="/phases" className="underline underline-offset-4">
            Phases page
          </Link>
          . {what}
        </>
      ) : (
        <>There are no phases yet, and an admin needs to add one. {what}</>
      )}
    </p>
  );
}
