// Class merging for shadcn components (https://ui.shadcn.com/docs/installation/manual).
// `cn` replaces clsx + tailwind-merge with the same output (https://github.com/shadcn-ui/cn).
export { cn } from 'cn';

/**
 * A link inside a sentence ("Add them on the Jobs page."): the text color, underlined, the line
 * thickening on hover (OD-145). Links that stand alone are buttons (`buttonVariants`).
 */
export const TEXT_LINK = 'text-foreground underline underline-offset-4 hover:decoration-2';
