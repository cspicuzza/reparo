import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/*
 * shadcn/ui Sheet, base-nova style, adapted for Plaster and tape (OD-48). Source:
 * shadcn-ui/ui @4233ed1, apps/v4/registry/bases/base/ui/sheet.tsx with the classes from
 * apps/v4/registry/styles/style-nova.css, resolved by hand. Changes from Nova, for the design
 * system's rules:
 * - The close button says "Close" next to its icon (no icon-only buttons) and is 44px tall.
 * - The page behind is dimmed with the `scrim` token (light and dark values) instead of a raw
 *   black and a backdrop blur.
 * - Panel: the popover surface, the divider border on its open edge and the floating shadow;
 *   16px text. Base UI's Dialog traps focus, returns it to the trigger and closes on Escape.
 * - Only the parts the app uses so far; add others from the same source when an issue needs them.
 */

function Sheet(props: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetContent({
  className,
  children,
  side = 'right',
  ...props
}: SheetPrimitive.Popup.Props & { side?: 'right' | 'left' | 'bottom' }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-scrim transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          'fixed z-50 flex flex-col gap-4 bg-popover text-base text-popover-foreground shadow-float transition-[opacity,translate] duration-200 ease-in-out outline-none data-ending-style:opacity-0 data-starting-style:opacity-0',
          'data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-[min(20rem,85vw)] data-[side=right]:border-l data-[side=right]:border-border data-[side=right]:data-ending-style:translate-x-10 data-[side=right]:data-starting-style:translate-x-10',
          'data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-[min(20rem,85vw)] data-[side=left]:border-r data-[side=left]:border-border data-[side=left]:data-ending-style:-translate-x-10 data-[side=left]:data-starting-style:-translate-x-10',
          'data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:border-t data-[side=bottom]:border-border data-[side=bottom]:data-ending-style:translate-y-10 data-[side=bottom]:data-starting-style:translate-y-10',
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex items-center justify-between gap-3 px-4 pt-3', className)}
      {...props}
    >
      {children}
      <SheetPrimitive.Close
        data-slot="sheet-close"
        className={buttonVariants({ variant: 'ghost', className: '-mr-2' })}
      >
        <X aria-hidden className="size-5" />
        Close
      </SheetPrimitive.Close>
    </div>
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-2xl', className)}
      {...props}
    />
  );
}

export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger };
