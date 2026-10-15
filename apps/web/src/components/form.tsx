import { ChevronDown, CircleAlert } from 'lucide-react';
import {
  Children,
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared field styling (Design system): 44px tall, 6px corners, the 3:1 field border on the panel
 * surface, 16px text. Focus uses the app's 2px ring (index.css). A field with a problem gets a
 * heavier border; the message below it says what to do.
 */
export const inputClass =
  'block min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground placeholder:text-muted-foreground aria-invalid:border-2 aria-invalid:border-foreground';

type FieldProps = {
  label: string;
  hint?: string;
  error?: string | undefined;
  /** One input, select or textarea; it's given the right aria-invalid and aria-describedby. */
  children: ReactNode;
  htmlFor: string;
};

/** Label above, hint or problem below. Every input gets a label (web.md → Accessibility). */
export function Field({ label, hint, error, children, htmlFor }: FieldProps) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;
  const control = Children.only(children);
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
      </label>
      <div className="mt-1.5">
        {isValidElement(control)
          ? cloneElement(control as ReactElement<Record<string, unknown>>, {
              'aria-invalid': error ? true : undefined,
              'aria-describedby': describedBy,
            })
          : control}
      </div>
      {error ? (
        <FormError id={`${htmlFor}-error`}>{error}</FormError>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A problem to fix, next to where it happened: the "needs you" marker (tape yellow) and words
 * that say what to do. Brick red stays for money and deleting (Design system → Colour).
 */
export function FormError({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      role="alert"
      className={cn('mt-1.5 flex items-start gap-2 text-sm font-semibold', className)}
    >
      <span className="mt-px inline-flex shrink-0 rounded-md bg-tape p-0.5 text-tape-ink">
        <CircleAlert aria-hidden className="size-3.5" />
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={cn(inputClass, className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cn(inputClass, className)} />;
}

/**
 * A dropdown with our own chevron (OD-82, Q45): the browser's arrow sits against the edge and
 * ignores padding, so it's hidden and ours sits 12px in, with 40px kept clear for it. `className`
 * places the dropdown (margins, width); the field itself fills it.
 */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select {...props} className={cn(inputClass, 'appearance-none pr-10')} />
      <SelectChevron />
    </div>
  );
}

/** The chevron on every dropdown; the parent must be `relative`. */
export function SelectChevron({ className }: { className?: string }) {
  return (
    <ChevronDown
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground',
        className,
      )}
    />
  );
}
