import { Popover } from '@base-ui/react/popover';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A small "What's this?" link beside a word that needs explaining, opening a short explanation
 * in a popover (OD-139, Q207): help where the question comes up, with no help page to keep up.
 * Built on Base UI's Popover (@base-ui/react 1.9.0, docs/react/components/popover.md in the
 * package): it opens on click or Enter, Escape or a click away closes it, and focus goes back
 * to the link. The link is 14px text with a 44px tap area.
 */
export function WhatsThis({
  title,
  children,
  label = "What's this?",
  className,
}: {
  /** The popover's heading, e.g. "Planned". */
  title: string;
  /** The explanation, a sentence or two. */
  children: ReactNode;
  /** The link's words, when "What's this?" doesn't read well ("What's a phase?"). */
  label?: string;
  className?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          'relative inline-flex min-h-8 cursor-pointer items-center rounded-sm text-sm font-normal text-foreground underline decoration-dotted underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-1.5 hover:decoration-solid [font-stretch:normal]',
          className,
        )}
      >
        {label}
        <span className="sr-only"> ({title})</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} collisionPadding={16} className="z-50">
          <Popover.Popup className="w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-[0_6px_24px_var(--float-shadow)] outline-none transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0">
            <Popover.Title className="font-semibold">{title}</Popover.Title>
            <Popover.Description render={<div />} className="mt-1 text-sm text-muted-foreground">
              {children}
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
