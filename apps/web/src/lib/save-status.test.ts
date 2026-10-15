import { describe, expect, it } from 'vitest';
import { saveStatusOf } from './save-status';

describe('saveStatusOf', () => {
  it('is saving while the mutation is pending', () => {
    expect(saveStatusOf('pending', true)).toBe('saving');
    expect(saveStatusOf('pending', false)).toBe('saving');
  });

  it('is an error until the next try', () => {
    expect(saveStatusOf('error', false)).toBe('error');
  });

  it('shows saved only while it is still fresh', () => {
    expect(saveStatusOf('success', true)).toBe('saved');
    expect(saveStatusOf('success', false)).toBe('idle');
  });

  it('is idle before anything was saved', () => {
    expect(saveStatusOf('idle', true)).toBe('idle');
  });
});
