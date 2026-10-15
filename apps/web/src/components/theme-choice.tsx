import { saveThemeChoice, THEME_CHOICES, useThemeChoice } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * Appearance as three side-by-side choices, for the phone's Menu panel (OD-83, Q58): real radio
 * buttons, so arrow keys move between them and screen readers hear a group of three.
 */
export function ThemeChoice({ className }: { className?: string }) {
  const choice = useThemeChoice();
  return (
    <fieldset className={className}>
      <legend className="text-sm text-muted-foreground">Appearance</legend>
      <div className="mt-1.5 flex rounded-lg border border-input p-0.5">
        {THEME_CHOICES.map((c) => (
          <label
            key={c.value}
            className={cn(
              'flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md text-base transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-solid',
              choice === c.value
                ? 'bg-primary font-semibold text-primary-foreground'
                : 'text-foreground hover:bg-accent',
            )}
          >
            <input
              type="radio"
              name="theme-choice"
              value={c.value}
              checked={choice === c.value}
              onChange={() => saveThemeChoice(c.value)}
              className="sr-only"
            />
            {c.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
