import type { ComponentProps, ReactNode } from 'react';

/** Shared form styling so every screen's inputs and buttons look like one app. */
export const inputClass =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none';
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
        <p role="alert" className="mt-1 text-sm text-foreground">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
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
