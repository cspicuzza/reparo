import type { ReactNode } from 'react';
import { knobStyle, SWITCH_KNOB, SWITCH_POSITION, SWITCH_TRACK } from '@/lib/switch';
import { cn } from '@/lib/utils';

/*
 * The app's two- and three-way switch (OD-142; it was built by hand five times): a recessed
 * track, a knob that slides under the picked choice, and real radio buttons underneath, so
 * arrow keys, screen readers and forms all work as they do for radios. The knob has a visible
 * edge (`border-input`, 3:1), so the picked choice shows by more than text weight.
 */

export type SwitchOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Can't be picked right now; say why nearby (e.g. Returned before it's bought). */
  disabled?: boolean;
};

export function SegmentedSwitch<T extends string>({
  name,
  value,
  options,
  onChange,
  disabled = false,
  knobClassName,
  positionClassName,
  className,
}: {
  /** The radio group's name, unique on the page. */
  name: string;
  value: T;
  options: SwitchOption<T>[];
  onChange: (value: T) => void;
  /** Every choice off, e.g. while a pick saves. */
  disabled?: boolean;
  /** The knob's colours for the picked choice, e.g. green for Purchased. */
  knobClassName?: string | undefined;
  /** Text colour and weight for each position. Picked positions default to semibold text. */
  positionClassName?: (option: T, picked: boolean) => string;
  className?: string;
}) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <div className={cn(SWITCH_TRACK, className)}>
      <span
        aria-hidden
        className={cn(SWITCH_KNOB, knobClassName)}
        style={knobStyle(index, options.length)}
      />
      {options.map((o) => {
        const picked = o.value === value;
        const off = disabled || o.disabled === true;
        return (
          <label
            key={o.value}
            className={cn(
              SWITCH_POSITION,
              'has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-solid',
              positionClassName
                ? positionClassName(o.value, picked)
                : picked
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground',
              o.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:text-foreground',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={picked}
              disabled={off}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
