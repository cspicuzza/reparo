import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
 * shadcn/ui Button, base-nova style, adapted for Plaster and tape (OD-32). Source: shadcn-ui/ui
 * @4233ed1, apps/v4/registry/bases/base/ui/button.tsx with the classes from
 * apps/v4/registry/styles/style-nova.css (the CLI couldn't reach the registry, so this is the
 * resolved file by hand). Changes from Nova, all for the design system's rules:
 * - Every size is at least 44px tall with 16px text (Nova's default is 32px, 14px).
 * - Outline uses the field border (3:1); Nova's uses the divider colour.
 * - Destructive is a brick-red outline, per the design; Nova's is a red tint.
 * - Focus uses the app's 2px ring outline (index.css) instead of Nova's 50% ring.
 * - Only the sizes the app can use: default and icon.
 * - buttonVariants() merges its own classes (cn), so a link styled as a button resolves the base
 *   `border-transparent` against a variant's border colour the same way <Button> does.
 */
const buttonStyles = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent bg-clip-padding max-w-full text-center text-base font-medium transition-colors select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive active:not-aria-[haspopup]:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/85',
        outline: 'border-input bg-card text-foreground hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'text-foreground hover:bg-accent',
        destructive: 'border-destructive bg-transparent text-destructive hover:bg-destructive/10',
        link: 'text-foreground underline underline-offset-4 hover:decoration-2',
      },
      size: {
        default: 'min-h-11 px-4 py-1.5',
        icon: 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/** Button classes for elements that aren't a <Button>, such as a router <Link>. */
function buttonVariants(props?: VariantProps<typeof buttonStyles> & { className?: string }) {
  return cn(buttonStyles(props));
}

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonStyles>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonStyles({ variant, size }), className)}
      {...props}
    />
  );
}

// buttonVariants styles links as buttons (shadcn's pattern); Fast Refresh does a full reload here.
// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };
