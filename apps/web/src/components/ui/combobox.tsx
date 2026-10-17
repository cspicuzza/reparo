import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inputClass } from '@/components/form';
import { NOT_A_LOGIN } from '@/lib/fields';

/*
 * shadcn/ui Combobox, base-nova style, adapted for Plaster and tape (OD-47). Source:
 * shadcn-ui/ui @4233ed1, apps/v4/registry/bases/base/ui/combobox.tsx with the classes from
 * apps/v4/registry/styles/style-nova.css, resolved by hand. Changes from Nova, for the design
 * system's rules:
 * - The input is the app's field (44px, 16px text, the 3:1 border) instead of Nova's 32px
 *   input group; the chevron is decoration only. Nova's icon-only trigger and clear buttons are
 *   left out (no icon-only buttons): the input opens the list on click or typing, and screens put
 *   a labelled button next to it to clear.
 * - Items are at least 44px with 16px text; the highlighted item gets the 2px ring outline as well
 *   as the hover tint, like the dropdown menu.
 * - Popup: 10px corners, the divider border and the floating shadow; no translucent blur.
 */

const Combobox = ComboboxPrimitive.Root;

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.InputGroup className="relative">
      <ComboboxPrimitive.Input
        {...NOT_A_LOGIN}
        data-slot="combobox-input"
        className={cn(inputClass, 'pr-11', className)}
        {...props}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground"
      />
    </ComboboxPrimitive.InputGroup>
  );
}

function ComboboxContent({
  className,
  side = 'bottom',
  sideOffset = 6,
  align = 'start',
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, 'side' | 'align' | 'sideOffset'>) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="isolate z-50 outline-none"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            'max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-float data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0',
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        'max-h-[min(20rem,var(--available-height))] scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none data-empty:p-0',
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        'relative flex min-h-11 w-full cursor-default items-center gap-2 rounded-lg py-2 pr-10 pl-3 text-base outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground data-highlighted:outline-2 data-highlighted:-outline-offset-2 data-highlighted:outline-solid data-highlighted:outline-ring [&_svg]:pointer-events-none [&_svg]:shrink-0',
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator className="absolute right-3 flex items-center">
        <Check aria-hidden className="size-5" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn('block px-3 py-3 text-base text-muted-foreground empty:hidden', className)}
      {...props}
    />
  );
}

export { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList };
