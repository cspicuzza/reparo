import { describe, expect, it } from 'vitest';
import { describeRoom } from './rooms';

describe('describeRoom', () => {
  it('formats both sides and the floor area', () => {
    expect(describeRoom({ lengthIn: 174, widthIn: 144 })).toEqual({
      dims: `14' 6" × 12'`,
      sqft: 174,
    });
  });
  it('shows a dash for the missing side and no area', () => {
    expect(describeRoom({ lengthIn: 87.5, widthIn: null })).toEqual({
      dims: `7' 3 1/2" × —`,
      sqft: null,
    });
  });
  it('is empty when unmeasured', () => {
    expect(describeRoom({ lengthIn: null, widthIn: null })).toEqual({ dims: null, sqft: null });
  });
});
