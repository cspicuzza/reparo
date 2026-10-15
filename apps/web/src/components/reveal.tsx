import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A section that opens and closes when someone asks it to (Workflow polish, OD-81): its height
 * eases open over 200ms (the grid-rows 0fr → 1fr technique, so no measuring) and its contents
 * fade in. Closed, it's inert, so nothing inside can be focused or read out. With reduced
 * motion only the fade remains (index.css).
 */
export function Reveal({
  open,
  id,
  className,
  children,
  ...rest
}: {
  open: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
  role?: string;
  'aria-label'?: string;
}) {
  return (
    <div
      id={id}
      inert={!open}
      aria-hidden={!open}
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
      {...rest}
    >
      {/* The caller's classes go one level in, so a top margin is clipped with the rest
          instead of holding the closed section open. */}
      <div className="min-h-0 overflow-hidden">
        <div className={className}>{children}</div>
      </div>
    </div>
  );
}
