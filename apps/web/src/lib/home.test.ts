import { describe, expect, it } from 'vitest';
import { greeting } from './home';

const at = (h: number) => new Date(2026, 9, 14, h, 30);

describe('greeting', () => {
  it('follows the time of day', () => {
    expect(greeting(at(8), 'Chris')).toBe('Good morning, Chris.');
    expect(greeting(at(13), 'Chris')).toBe('Good afternoon, Chris.');
    expect(greeting(at(19), 'Chris')).toBe('Good evening, Chris.');
    expect(greeting(at(2), 'Chris')).toBe('Good evening, Chris.');
  });

  it('uses the first name, or none', () => {
    expect(greeting(at(9), 'Chris Spicuzza')).toBe('Good morning, Chris.');
    expect(greeting(at(9))).toBe('Good morning.');
    expect(greeting(at(9), '  ')).toBe('Good morning.');
  });
});
