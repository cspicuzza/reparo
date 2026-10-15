import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * A Remove button that asks first, in place: "Remove X? Yes, remove it / Keep it". For rows
 * whose loss would change money or work, so one stray tap doesn't.
 */
export function ConfirmRemove({
  what,
  disabled,
  onConfirm,
}: {
  /** Read out in the button's label and the question, e.g. "the $10,000.00 payment". */
  what: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="text-muted-foreground"
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
        Yes, remove it
      </Button>
      <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
        Keep it
      </Button>
    </span>
  );
}
