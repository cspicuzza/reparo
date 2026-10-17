import { useSyncExternalStore } from 'react';

/*
 * Light, dark, or whatever the device uses (Workflow polish, OD-83, Q57–Q60). The choice is
 * remembered in this browser only (Q59). `index.html` applies it before the app loads, so the
 * page never flashes the wrong theme; this module keeps it applied afterwards. The page's
 * colors hang off `data-theme` on <html> (index.css).
 */

export type ThemeChoice = 'device' | 'light' | 'dark';

/** Must match the key the script in index.html reads. */
export const THEME_KEY = 'reparo-theme';

export const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'device', label: 'Device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Anything other than light or dark (nothing saved, storage blocked) means follow the device. */
export function parseThemeChoice(saved: string | null): ThemeChoice {
  return saved === 'light' || saved === 'dark' ? saved : 'device';
}

export function readThemeChoice(): ThemeChoice {
  try {
    return parseThemeChoice(localStorage.getItem(THEME_KEY));
  } catch {
    return 'device';
  }
}

export function resolveTheme(choice: ThemeChoice, deviceIsDark: boolean): 'light' | 'dark' {
  if (choice === 'device') return deviceIsDark ? 'dark' : 'light';
  return choice;
}

/**
 * Put the theme on the page. Every color transition would otherwise fire at once and smear,
 * so transitions are off for that one frame (OD-81, the better-ui recipe: add an override,
 * force a style flush, remove it after the next paint).
 */
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  const next = resolveTheme(choice, window.matchMedia(DARK_QUERY).matches);
  if (root.dataset['theme'] === next) return;
  const style = document.createElement('style');
  style.append(document.createTextNode('*,*::before,*::after{transition:none !important}'));
  document.head.append(style);
  root.dataset['theme'] = next;
  void document.body.offsetHeight; // forces the style flush while the override is in place
  requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
}

const listeners = new Set<() => void>();

export function saveThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'device') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage blocked (a private window, say): the choice still applies until the page closes.
    current = choice;
  }
  applyTheme(choice);
  listeners.forEach((l) => l());
}

let current: ThemeChoice | null = null;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab changed the choice.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    applyTheme(readThemeChoice());
    onChange();
  };
  // The device switched between light and dark: matters while following the device.
  const media = window.matchMedia(DARK_QUERY);
  const onMedia = () => applyTheme(snapshot());
  window.addEventListener('storage', onStorage);
  media.addEventListener('change', onMedia);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
    media.removeEventListener('change', onMedia);
  };
}

function snapshot(): ThemeChoice {
  return current ?? readThemeChoice();
}

/** The current choice, kept up to date; subscribing also keeps the page in step with the device. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, snapshot, () => 'device');
}
