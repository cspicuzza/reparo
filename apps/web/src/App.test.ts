import { describe, expect, it } from 'vitest';
import { formatMoney } from '@reparo/shared';

describe('@reparo/web', () => {
  it('resolves the shared workspace package', () => {
    expect(formatMoney(3283625)).toBe('$32,836.25');
  });
});
