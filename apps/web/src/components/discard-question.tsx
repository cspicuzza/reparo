import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * "Discard your changes?", asked in the page or panel instead of the browser's own dialog
 * (OD-114, Q138). Like the other confirm steps, it focuses Yes when it appears.
 */
export function DiscardQuestion({
  onDiscard,
  onKeep,
  className,
}: {
  onDiscard: () => void;
  onKeep: () => void;
  className?: string;
}) {
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    yes.current?.focus();
  }, []);
  return (
    <div
      role="alertdialog"
      aria-label="Discard your changes?"
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-border bg-card p-3',
        className,
      )}
    >
      <p className="w-full font-semibold">Discard your changes?</p>
      <Button ref={yes} type="button" variant="destructive" onClick={onDiscard}>
        Yes, discard
      </Button>
      <Button type="button" variant="ghost" onClick={onKeep}>
        Keep editing
      </Button>
    </div>
  );
}
