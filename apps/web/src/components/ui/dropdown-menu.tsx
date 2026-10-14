import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { cn } from '@/lib/utils';

/*
 * shadcn/ui Dropdown Menu, base-nova style, adapted for Plaster and tape (OD-38). Source:
 * shadcn-ui/ui @4233ed1, apps/v4/registry/bases/base/ui/dropdown-menu.tsx with the classes from
 * apps/v4/registry/styles/style-nova.css, resolved by hand. Changes from Nova, for the design
 * system's rules:
 * - Items are at least 44px tall with 16px text (Nova: ~28px, 14px); the label is 14px (Nova: 12px).
 * - The highlighted item gets the 2px ring outline as well as the hover tint, so keyboard focus
 *   stays visible (≥ 3:1); Nova relies on a faint tint.
 * - Panel: 10px corners, the divider border and the floating shadow; no translucent blur.
 * - Only the parts the app uses so far; add others from the same source when an issue needs them.
 */

function DropdownMenu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  align = 'end',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 6,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            'z-50 max-h-(--available-height) min-w-56 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0',
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup(props: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      className={cn('px-3 py-2 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function DropdownMenuItem({
  className,
  variant = 'default',
  ...props
}: MenuPrimitive.Item.Props & { variant?: 'default' | 'destructive' }) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        'relative flex min-h-11 cursor-default items-center gap-2 rounded-lg px-3 text-base outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground data-highlighted:outline-2 data-highlighted:-outline-offset-2 data-highlighted:outline-solid data-highlighted:outline-ring data-[variant=destructive]:text-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-5',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
};
