import { describe, expect, it } from 'vitest';
import { describeRoom, roomProgressText } from './rooms';

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

describe('roomProgressText', () => {
  it('counts jobs done out of those that count', () => {
    expect(roomProgressText({ done: 2, total: 4 })).toBe('2 of 4 jobs done');
    expect(roomProgressText({ done: 0, total: 1 })).toBe('0 of 1 job done');
  });

  it('says when everything is done or nothing is planned', () => {
    expect(roomProgressText({ done: 4, total: 4 })).toBe('All 4 jobs done');
    expect(roomProgressText({ done: 1, total: 1 })).toBe('Its one job is done');
    expect(roomProgressText({ done: 0, total: 0 })).toBe('No jobs here yet');
  });
});
