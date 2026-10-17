import { describe, expect, it } from 'vitest';
import { groupBy } from './group';

describe('groupBy()', () => {
  it('groups in order and leaves out keys with nothing', () => {
    const files = [
      { id: 1, ownerId: 'a' },
      { id: 2, ownerId: 'b' },
      { id: 3, ownerId: 'a' },
    ];
    const by = groupBy(files, (f) => f.ownerId);
    expect(by.get('a')?.map((f) => f.id)).toEqual([1, 3]);
    expect(by.get('b')?.map((f) => f.id)).toEqual([2]);
    expect(by.has('c')).toBe(false);
  });

  it('keeps null as its own key', () => {
    const by = groupBy([{ room: null }, { room: 'r1' }, { room: null }], (l) => l.room);
    expect(by.get(null)).toHaveLength(2);
  });
});
