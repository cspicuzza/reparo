import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A section on the page: the panel surface, 10px corners and a thin border (no shadow). */
export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-xl border border-border bg-card p-5 sm:p-6', className)}
      {...props}
    />
  );
}

/** Rows on a panel, separated by divider lines. */
export function PanelList({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      className={cn(
        'divide-y divide-border overflow-hidden rounded-xl border border-border bg-card',
        className,
      )}
      {...props}
    />
  );
}
