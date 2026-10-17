import { useMutation } from '@tanstack/react-query';
import { use, useState, type KeyboardEvent, type ReactNode } from 'react';
import { FormError, inputClass } from '@/components/form';
import { NOT_A_LOGIN } from '@/lib/fields';
import { SaveProblem, SaveStatus } from '@/components/save-state';
import { PanelDirtyContext } from '@/lib/panel-dirty';
import { useToasts } from '@/lib/toasts';
import { cn } from '@/lib/utils';

/**
 * A one-value edit that saves when you leave the field, with no Save button (web.md → Saving;
 * Workflow polish, OD-77). It saves only if the value changed and passes `validate` (the same
 * Zod schema the API uses); otherwise it says what to fix and keeps the old value on the server.
 * Saving / Saved / Couldn't save show on its label line, and why a save failed shows under it
 * (OD-84). Escape while typing puts back what was there; after a save, a message offers Undo
 * for 10 seconds, which saves the old value again (OD-139, Q206). Money fields say what
 * changed in their own message, so they turn this one off (`undo={false}`).
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
  inputMode,
  list,
  labelClassName,
  className,
  undo = true,
}: {
  id: string;
  label: ReactNode;
  /** Said under the field; may end with a small action, like "Rename Amazon everywhere…". */
  hint?: ReactNode;
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
  /** `tel` and `email` bring up the phone's matching keyboard (OD-124, Q159). */
  type?: 'text' | 'date' | 'url' | 'tel' | 'email';
  inputMode?: 'text' | 'decimal' | 'numeric' | 'url' | 'tel' | 'email';
  /** A <datalist> id, for suggestions as you type. */
  list?: string;
  /** e.g. `sr-only` when something else on screen already says what the field is. */
  labelClassName?: string;
  /** Sizes the whole field, e.g. a short width for money (OD-82, Q52). */
  className?: string;
  /** Offer Undo after each save (OD-139); off where the caller's own message does. */
  undo?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  // Take the server's value when it changes (after a save, or someone else's edit), the way the
  // React docs adjust state from a prop: https://react.dev/learn/you-might-not-need-an-effect
  const [seen, setSeen] = useState(initial);
  // The value last sent, so Enter then leaving the field saves (and offers Undo) once.
  const [sent, setSent] = useState<string | null>(null);
  if (initial !== seen) {
    setSeen(initial);
    setValue(initial);
    setSent(null);
  }
  const save = useMutation({ mutationFn: onSave });
  const toasts = useToasts();
  // Inside a side panel, typing that hasn't been saved yet makes closing ask first (OD-82).
  const setPanelDirty = use(PanelDirtyContext);

  const commit = () => {
    if (value === initial) {
      setProblem(null);
      setPanelDirty?.(false);
      return;
    }
    const message = validate?.(value) ?? null;
    setProblem(message);
    setPanelDirty?.(message !== null);
    if (message !== null || value === sent) return;
    setSent(value);
    const before = initial;
    save.mutate(value, {
      onError: () => setSent(null),
      onSuccess: () => {
        if (!undo) return;
        toasts.add({
          title: 'Saved',
          description: what,
          timeout: 10_000,
          // Saving the old value again, through the same field, so its label says so.
          actionProps: {
            children: 'Undo',
            onClick: () => {
              setSent(null);
              save.mutate(before);
            },
          },
        });
      },
    });
  };

  // Escape while typing puts back what was there before (OD-139, Q206). With nothing typed it
  // does what Escape does around it, such as closing the side panel.
  const revert = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key !== 'Escape' || value === initial) return;
    e.preventDefault();
    e.stopPropagation();
    setValue(initial);
    setProblem(null);
    setPanelDirty?.(false);
  };

  const failed = save.status === 'error';
  const describedBy = problem
    ? `${id}-error`
    : failed
      ? `${id}-save-error`
      : hint
        ? `${id}-hint`
        : undefined;
  const common = {
    ...NOT_A_LOGIN,
    id,
    value,
    placeholder,
    'aria-invalid': problem ? true : undefined,
    'aria-describedby': describedBy,
    onChange: (e: { target: { value: string } }) => {
      setValue(e.target.value);
      setPanelDirty?.(e.target.value !== initial);
    },
    onBlur: commit,
    className: cn(inputClass, inputClassName),
  };
  const field = multiline ? (
    <textarea rows={rows} {...common} onKeyDown={revert} />
  ) : (
    <input
      type={type}
      autoComplete="off"
      inputMode={inputMode}
      list={list}
      {...common}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        else revert(e);
      }}
    />
  );
  const status = <SaveStatus mutation={save} what={what} />;
  const retry = () => save.mutate(save.variables ?? value);
  const labelHidden = labelClassName === 'sr-only';

  return (
    <div className={className}>
      {/* The label, with what happened to the last save at the right of its line (OD-84). A
          field whose label is hidden (the panel's name heading) has its state beside it. */}
      {labelHidden ? (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      ) : (
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id} className={cn('block text-sm font-semibold', labelClassName)}>
            {label}
          </label>
          {status}
        </div>
      )}
      {labelHidden ? (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">{wrap ? wrap(field) : field}</div>
          {status}
        </div>
      ) : (
        <div className="mt-1.5">{wrap ? wrap(field) : field}</div>
      )}
      {problem ? (
        <FormError id={`${id}-error`}>{problem}</FormError>
      ) : failed ? (
        <SaveProblem id={`${id}-save-error`} mutation={save} onRetry={retry} />
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
