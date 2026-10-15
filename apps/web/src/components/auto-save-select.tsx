import { useMutation } from '@tanstack/react-query';
import { SelectChevron, inputClass } from '@/components/form';
import { SaveState } from '@/components/save-state';
import { cn } from '@/lib/utils';

/**
 * A dropdown that saves the moment something is picked, with Saving / Saved / Couldn't save
 * beside it (web.md → Saving; OD-82, Q53). While it saves it shows the new choice; if the save
 * fails it goes back to what the server holds and offers Try again.
 */
export function AutoSaveSelect({
  id,
  label,
  hint,
  value,
  options,
  onSave,
  what,
}: {
  id: string;
  label: string;
  hint?: string;
  /** What the server holds. */
  value: string;
  options: { value: string; label: string }[];
  onSave: (value: string) => Promise<unknown>;
  /** Read out with the result, e.g. "Room for Chandelier". */
  what: string;
}) {
  const save = useMutation({ mutationFn: onSave });
  const shown = save.isPending && save.variables !== undefined ? save.variables : value;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <div className="relative mt-1.5">
        <select
          id={id}
          value={shown}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            if (e.target.value !== value) save.mutate(e.target.value);
          }}
          className={cn(inputClass, 'appearance-none pr-10')}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <SelectChevron />
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <SaveState
        className="mt-1"
        mutation={save}
        what={what}
        onRetry={() => {
          if (save.variables !== undefined) save.mutate(save.variables);
        }}
      />
    </div>
  );
}
