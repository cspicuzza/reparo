import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';

const KEY = (role: string) => `reparo:welcomed:${role}`;

function seen(role: string): boolean {
  try {
    return localStorage.getItem(KEY(role)) !== null;
  } catch {
    return false;
  }
}

const WHAT_YOU_CAN_DO = {
  editor:
    'As an editor you can add and change rooms, jobs, estimates, payments and the shopping list. The budget, phases and categories are kept by the admin.',
  viewer:
    'You can see everything here: the money, the rooms, the jobs and the shopping list. Nothing you do here changes it; ask the admin if you’d like to help edit.',
} as const;

/**
 * A one-time note on Home for editors and viewers saying what they can do (OD-139, Q207). Got it
 * puts it away for good in this browser (localStorage; if that's unavailable it simply comes
 * back next time). An admin previewing a role sees that role's note, as they would.
 */
export function WelcomeNote() {
  const { role } = useMe();
  const [dismissed, setDismissed] = useState(false);
  if (role !== 'editor' && role !== 'viewer') return null;
  if (dismissed || seen(role)) return null;
  return (
    <section
      aria-labelledby="welcome"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="min-w-0 flex-[1_1_24rem]">
        <h2 id="welcome" className="text-2xl">
          Welcome to Reparo
        </h2>
        <p className="mt-1 max-w-prose text-muted-foreground">{WHAT_YOU_CAN_DO[role]}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          try {
            localStorage.setItem(KEY(role), new Date().toISOString());
          } catch {
            // Not kept this time.
          }
          setDismissed(true);
        }}
      >
        Got it
      </Button>
    </section>
  );
}
