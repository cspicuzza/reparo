import { useThemeChoice } from '@/lib/theme';

/**
 * Keeps the page's light or dark in step with the saved choice, the device and other tabs
 * (OD-83). Mounted once, in the root, so it listens on every page, signed in or not.
 */
export function ThemeSync() {
  useThemeChoice();
  return null;
}
