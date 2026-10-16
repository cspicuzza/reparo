import { FormError } from '@/components/form';
import { Button } from '@/components/ui/button';
import { loadProblem } from '@/lib/load-problem';
import { cn } from '@/lib/utils';

/** A query's part that LoadError needs. */
type Retryable = { refetch: () => unknown };

/**
 * The one way a section says it couldn't load (OD-110, Q122): red text with the alert icon
 * (`FormError`), what didn't load and why in household words, and Try again, which refetches
 * just the queries that section needs. No page reload.
 */
export function LoadError({
  what,
  error,
  retry,
  className,
}: {
  /** What didn't load, as it reads after "Couldn't load": "the rooms", "this job's files". */
  what: string;
  error: unknown;
  /** The queries Try again refetches. */
  retry: Retryable[];
  className?: string | undefined;
}) {
  return (
    <div className={cn('flex flex-col items-start gap-2', className)}>
      <FormError className="mt-0">
        Couldn&apos;t load {what}. {loadProblem(error)}
      </FormError>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          for (const q of retry) void q.refetch();
        }}
      >
        Try again
      </Button>
    </div>
  );
}
