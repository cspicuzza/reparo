import type { ComponentProps, ReactNode } from 'react';

/** Shared form styling so every screen's inputs and buttons look like one app. */
export const inputClass =
  'w-full rounded-md border border-chalk bg-paper px-3 py-2 text-base text-ink placeholder:text-pencil/70 focus:border-moss focus:outline-none';
export const primaryButtonClass =
  'rounded-md bg-moss px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-moss-deep disabled:opacity-50';
export const quietButtonClass =
  'rounded-md px-3 py-2 text-sm text-ink underline-offset-4 hover:underline disabled:opacity-50';
export const dangerButtonClass =
  'rounded-md border border-chalk px-3 py-2 text-sm text-ink hover:border-ink disabled:opacity-50';

type FieldProps = {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
  htmlFor: string;
};

/** Label above, hint and error below. Every input gets a label (conventions → Accessibility). */
export function Field({ label, hint, error, children, htmlFor }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p role="alert" className="mt-1 text-sm text-ink">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-sm text-pencil">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}
