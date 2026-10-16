import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * A Remove button that asks first, in place: "Remove X? Yes, remove it / Keep it". For rows
 * whose loss would change money or work, so one stray tap doesn't.
 *
 * `strong` is the shopping line's version (OD-103): a red Remove and the batch bar's words,
 * "Yes, remove / Keep", so removing one item looks and reads like removing many.
 */
export function ConfirmRemove({
  what,
  disabled,
  strong = false,
  onConfirm,
}: {
  /** Read out in the button's label and the question, e.g. "the $10,000.00 payment". */
  what: string;
  disabled?: boolean;
  strong?: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button
        type="button"
        variant={strong ? 'destructive' : 'ghost'}
        className={strong ? undefined : 'text-muted-foreground'}
        aria-label={`Remove ${what}`}
        onClick={() => setAsking(true)}
      >
        Remove
      </Button>
    );
  }
  return (
    <span role="group" aria-label={`Remove ${what}?`} className="flex flex-wrap items-center gap-1">
      <Button
        type="button"
        variant="destructive"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {strong ? 'Yes, remove' : 'Yes, remove it'}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
        {strong ? 'Keep' : 'Keep it'}
      </Button>
    </span>
  );
}
