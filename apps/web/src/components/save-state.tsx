import { Check, CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSaveStatus, type SaveLike } from '@/lib/save-status';
import { cn } from '@/lib/utils';

/**
 * What happened to a save, beside the control that made it (web.md → Saving): Saving…, Saved,
 * or Couldn't save with Try again. The words sit in a polite live region that is always in the
 * page, so screen readers hear each change without focus moving.
 */
export function SaveState({
  mutation,
  onRetry,
  what,
  className,
}: {
  mutation: SaveLike & { error: { message: string } | null };
  onRetry: () => void;
  /** Read out with the result, e.g. "Status of Paint in the Kitchen". */
  what: string;
  className?: string;
}) {
  const status = useSaveStatus(mutation);
  return (
    <span className={cn('inline-flex min-h-6 flex-wrap items-center gap-x-2 text-sm', className)}>
      <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5">
        {status === 'saving' ? <span className="text-muted-foreground">Saving…</span> : null}
        {status === 'saved' ? (
          <>
            <Check
              aria-hidden
              absoluteStrokeWidth
              strokeWidth={2}
              className="size-4 animate-saved-in"
            />
            <span>
              Saved<span className="sr-only">: {what}</span>
            </span>
          </>
        ) : null}
        {status === 'error' ? (
          <>
            <span className="inline-flex shrink-0 rounded-md bg-tape p-0.5 text-tape-ink">
              <CircleAlert aria-hidden className="size-3.5" />
            </span>
            <span className="font-semibold">
              Couldn&apos;t save<span className="sr-only"> {what}</span>
              {mutation.error ? `: ${mutation.error.message}` : ''}
            </span>
          </>
        ) : null}
      </span>
      {status === 'error' ? (
        <Button type="button" variant="ghost" className="-my-2 px-2" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </span>
  );
}
