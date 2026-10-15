import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { saveThemeChoice, THEME_CHOICES, useThemeChoice, type ThemeChoice } from '@/lib/theme';
import { cn } from '@/lib/utils';

/*
 * Appearance as a switch (OD-83, Chris's review): a pill track with a knob that slides to
 * Device, Light or Dark, each shown by its icon. The choice's name sits beside it as text and
 * every position has a screen-reader name, so nothing is icon-only to anyone (web.md → Icons).
 */

const ICON: Record<ThemeChoice, LucideIcon> = { device: Monitor, light: Sun, dark: Moon };

/** What the text beside the switch says. */
function choiceText(choice: ThemeChoice) {
  if (choice !== 'device') return choice === 'dark' ? 'Dark' : 'Light';
  return 'Same as this device';
}

/** The track and the sliding knob; the three 44px positions go inside. */
function Track({ index, children }: { index: number; children: ReactNode }) {
  return (
    <div className="relative inline-flex shrink-0 rounded-full border border-input bg-inset p-0.5">
      <span
        aria-hidden
        className="absolute top-0.5 left-0.5 size-11 rounded-full bg-card shadow-sm transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {children}
    </div>
  );
}

const POSITION =
  'relative z-10 grid size-11 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors duration-150 hover:text-foreground [&_svg]:size-5';
const PICKED = 'text-foreground';

function Label({ choice }: { choice: ThemeChoice }) {
  return (
    <span className="min-w-0">
      <span className="block text-base">Appearance</span>
      <span className="block text-sm text-muted-foreground">{choiceText(choice)}</span>
    </span>
  );
}

/** For the phone's Menu panel: real radio buttons, so arrow keys move between positions. */
export function ThemeSwitch({ className }: { className?: string }) {
  const choice = useThemeChoice();
  const index = THEME_CHOICES.findIndex((c) => c.value === choice);
  return (
    <fieldset className={cn('flex items-center justify-between gap-3', className)}>
      <legend className="sr-only">Appearance</legend>
      <Label choice={choice} />
      <Track index={index}>
        {THEME_CHOICES.map((c) => {
          const Icon = ICON[c.value];
          return (
            <label
              key={c.value}
              className={cn(
                POSITION,
                'has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-solid',
                choice === c.value && PICKED,
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
              <Icon aria-hidden absoluteStrokeWidth strokeWidth={2} />
              <span className="sr-only">{c.label}</span>
            </label>
          );
        })}
      </Track>
    </fieldset>
  );
}

/**
 * For the account menu on a laptop: the same switch built from the menu's own radio items, so
 * the arrow keys that move through the menu move along the switch too (Base UI 1.9.0 Menu).
 */
export function ThemeSwitchMenu() {
  const choice = useThemeChoice();
  const index = THEME_CHOICES.findIndex((c) => c.value === choice);
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5">
      <Label choice={choice} />
      <MenuPrimitive.RadioGroup
        value={choice}
        onValueChange={(v: ThemeChoice) => saveThemeChoice(v)}
        aria-label="Appearance"
      >
        <Track index={index}>
          {THEME_CHOICES.map((c) => {
            const Icon = ICON[c.value];
            return (
              <MenuPrimitive.RadioItem
                key={c.value}
                value={c.value}
                closeOnClick={false}
                aria-label={c.label}
                className={cn(
                  POSITION,
                  'outline-none data-highlighted:outline-2 data-highlighted:outline-ring data-highlighted:outline-solid',
                  choice === c.value && PICKED,
                )}
              >
                <Icon aria-hidden absoluteStrokeWidth strokeWidth={2} />
              </MenuPrimitive.RadioItem>
            );
          })}
        </Track>
      </MenuPrimitive.RadioGroup>
    </div>
  );
}
