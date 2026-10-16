import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The app's one confirm step (OD-113, Q129): a button that asks first, in place, so one stray
 * tap doesn't change money or work. Asking moves focus to "Yes"; Keep puts it back on the
 * button that asked.
 *
 * `strong` is the red version (OD-103): a red trigger and the batch bar's words, "Yes, remove /
 * Keep". Rooms, jobs, archiving a vendor, budget entries and shopping lines use it. Without
 * `strong`, smaller rows (payments, costs, files) get a quiet trigger and "Yes, remove it /
 * Keep it". `tone="neutral"` is for a confirm that isn't a removal (choosing an estimate).
 * `blocked` replaces the question with why it can't be done yet, and an OK.
 */
export function ConfirmRemove({
  what,
  disabled,
  strong = false,
  onConfirm,
  label = 'Remove',
  question,
  confirmLabel,
  keepLabel,
  tone = 'danger',
  blocked,
  className,
}: {
  /** Read out in the button's label and the question, e.g. "the $10,000.00 payment". */
  what: string;
  disabled?: boolean;
  strong?: boolean;
  onConfirm: () => void;
  /** The trigger's words: "Remove", "Remove this room", "Archive TJ". */
  label?: string;
  /** Shown while asking, before the buttons; without it the question is only read out. */
  question?: ReactNode;
  confirmLabel?: string;
  keepLabel?: string;
  tone?: 'danger' | 'neutral';
  /** Why it can't be done yet. Asking then shows this and OK instead of Yes. */
  blocked?: ReactNode;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const answer = useRef<HTMLButtonElement>(null);
  const backToTrigger = useRef(false);

  useEffect(() => {
    if (asking) {
      answer.current?.focus();
    } else if (backToTrigger.current) {
      backToTrigger.current = false;
      trigger.current?.focus();
    }
  }, [asking]);

  const keep = () => {
    backToTrigger.current = true;
    setAsking(false);
  };

  if (!asking) {
    return (
      <Button
        ref={trigger}
        type="button"
        variant={strong ? 'destructive' : 'ghost'}
        className={cn(!strong && 'text-muted-foreground', className)}
        aria-label={label === 'Remove' ? `Remove ${what}` : undefined}
        onClick={() => setAsking(true)}
      >
        {label}
      </Button>
    );
  }

  const asked = question ?? `${label === 'Remove' ? 'Remove' : label} ${what}?`;
  return (
    <div
      role="group"
      aria-label={typeof asked === 'string' ? asked : `${label} ${what}?`}
      className={cn('flex flex-wrap items-center gap-x-2 gap-y-2', className)}
    >
      {blocked ? (
        <>
          <p className="w-full max-w-prose" role="alert">
            {blocked}
          </p>
          <Button ref={answer} type="button" variant="outline" onClick={keep}>
            OK
          </Button>
        </>
      ) : (
        <>
          {question ? <p className="w-full max-w-prose">{question}</p> : null}
          <Button
            ref={answer}
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'default'}
            disabled={disabled}
            onClick={() => {
              setAsking(false);
              onConfirm();
            }}
          >
            {confirmLabel ?? (strong ? 'Yes, remove' : 'Yes, remove it')}
          </Button>
          <Button type="button" variant="ghost" onClick={keep}>
            {keepLabel ?? (strong ? 'Keep' : 'Keep it')}
          </Button>
        </>
      )}
    </div>
  );
}
