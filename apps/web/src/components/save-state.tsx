import { Check, CircleAlert } from 'lucide-react';
import { FormError } from '@/components/form';
import { Button } from '@/components/ui/button';
import { useSaveStatus, type SaveLike } from '@/lib/save-status';
import { cn } from '@/lib/utils';

type SaveMutation = SaveLike & { error: { message: string } | null };

/**
 * What happened to a save, in a few words: Saving… in grey, Saved with a check in green, or
 * Couldn't save with an alert in red (Workflow polish, OD-84, Q62–Q64; web.md → Saving). It sits
 * on the field's label line, right-aligned. The words are in a polite live region that is
 * always in the page, so screen readers hear each change without focus moving.
 */
export function SaveStatus({
  mutation,
  what,
  className,
}: {
  mutation: SaveLike;
  /** Read out with the result, e.g. "Status of Paint in the Kitchen". */
  what: string;
  className?: string;
}) {
  const status = useSaveStatus(mutation);
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn('inline-flex shrink-0 items-center gap-1 text-sm', className)}
    >
      {status === 'saving' ? <span className="text-muted-foreground">Saving…</span> : null}
      {status === 'saved' ? (
        <span className="inline-flex items-center gap-1 font-semibold text-status-done">
          <Check
            aria-hidden
            absoluteStrokeWidth
            strokeWidth={2}
            className="size-4 animate-saved-in"
          />
          Saved<span className="sr-only">: {what}</span>
        </span>
      ) : null}
      {status === 'error' ? (
        <span className="inline-flex items-center gap-1 font-semibold text-destructive">
          <CircleAlert aria-hidden absoluteStrokeWidth strokeWidth={2} className="size-4" />
          Couldn&apos;t save<span className="sr-only"> {what}</span>
        </span>
      ) : null}
    </span>
  );
}

/** Why a save failed and Try again, under the field (Q64). Nothing when the save didn't fail. */
export function SaveProblem({
  id,
  mutation,
  onRetry,
}: {
  id?: string;
  mutation: SaveMutation;
  onRetry: () => void;
}) {
  if (mutation.status !== 'error') return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <FormError {...(id ? { id } : {})} className="min-w-0">
        {mutation.error?.message ?? 'Something went wrong'}
      </FormError>
      <Button type="button" variant="ghost" className="mt-1.5 -mb-2 px-2" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/**
 * Status, reason and Try again together, for a control with no label line to sit on: a
 * status dropdown inside a list row (Q66).
 */
export function SaveState({
  mutation,
  onRetry,
  what,
  className,
}: {
  mutation: SaveMutation;
  onRetry: () => void;
  what: string;
  className?: string;
}) {
  const status = useSaveStatus(mutation);
  return (
    <span className={cn('inline-flex min-h-6 flex-wrap items-center gap-x-2 text-sm', className)}>
      <SaveStatus mutation={mutation} what={what} />
      {status === 'error' ? (
        <>
          {mutation.error ? (
            <span className="font-semibold text-destructive">{mutation.error.message}</span>
          ) : null}
          <Button type="button" variant="ghost" className="-my-2 px-2" onClick={onRetry}>
            Try again
          </Button>
        </>
      ) : null}
    </span>
  );
}
