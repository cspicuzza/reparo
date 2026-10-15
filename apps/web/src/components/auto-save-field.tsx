import { useMutation } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { FormError, inputClass } from '@/components/form';
import { SaveState } from '@/components/save-state';
import { cn } from '@/lib/utils';

/**
 * A one-value edit that saves when you leave the field, with no Save button (web.md → Saving;
 * Workflow polish, OD-77). It saves only if the value changed and passes `validate` (the same
 * Zod schema the API uses); otherwise it says what to fix and keeps the old value on the server.
 * Saving / Saved / Couldn't save show beside it.
 */
export function AutoSaveField({
  id,
  label,
  hint,
  initial,
  multiline = false,
  rows = 3,
  placeholder,
  inputClassName,
  validate,
  onSave,
  what,
  wrap,
  type = 'text',
}: {
  id: string;
  label: ReactNode;
  hint?: string;
  /** What the server holds, as the field shows it. */
  initial: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  inputClassName?: string;
  /** A message saying what to fix, or null when the value can be saved. */
  validate?: (value: string) => string | null;
  onSave: (value: string) => Promise<unknown>;
  /** Read out with the result, e.g. "Notes for the Kitchen". */
  what: string;
  /** Draw something around the field, such as a dimension line. */
  wrap?: (field: ReactNode) => ReactNode;
  type?: 'text' | 'date';
}) {
  const [value, setValue] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  // Take the server's value when it changes (after a save, or someone else's edit), the way the
  // React docs adjust state from a prop: https://react.dev/learn/you-might-not-need-an-effect
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setValue(initial);
  }
  const save = useMutation({ mutationFn: onSave });

  const commit = () => {
    if (value === initial) {
      setProblem(null);
      return;
    }
    const message = validate?.(value) ?? null;
    setProblem(message);
    if (message === null) save.mutate(value);
  };

  const describedBy = problem ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const common = {
    id,
    value,
    placeholder,
    'aria-invalid': problem ? true : undefined,
    'aria-describedby': describedBy,
    onChange: (e: { target: { value: string } }) => setValue(e.target.value),
    onBlur: commit,
    className: cn(inputClass, inputClassName),
  };
  const field = multiline ? (
    <textarea rows={rows} {...common} />
  ) : (
    <input
      type={type}
      autoComplete="off"
      {...common}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <div className="mt-1.5">{wrap ? wrap(field) : field}</div>
      {problem ? (
        <FormError id={`${id}-error`}>{problem}</FormError>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <SaveState
        className="mt-1"
        mutation={save}
        what={what}
        onRetry={() => save.mutate(save.variables ?? value)}
      />
    </div>
  );
}
