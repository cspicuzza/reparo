import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Stand-in for a picture that doesn't exist yet: a faint drafting grid on the inset surface,
 * with a short label. The only place the plan grid appears (web.md → tape motif).
 */
export function PlanGrid({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center bg-inset bg-[linear-gradient(var(--grid)_1px,transparent_1px),linear-gradient(90deg,var(--grid)_1px,transparent_1px)] bg-size-[20px_20px] p-4 text-center text-sm text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}
