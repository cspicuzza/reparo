import { describe, expect, it } from 'vitest';
import { parseThemeChoice, resolveTheme } from './theme';

describe('theme choice (OD-83)', () => {
  it('reads only light or dark; anything else follows the device', () => {
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('dark')).toBe('dark');
    expect(parseThemeChoice(null)).toBe('device');
    expect(parseThemeChoice('purple')).toBe('device');
  });
  it('resolves Device from the device, and Light or Dark regardless of it', () => {
    expect(resolveTheme('device', true)).toBe('dark');
    expect(resolveTheme('device', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
