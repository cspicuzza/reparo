import { describe, expect, it } from 'vitest';
import { lineWhere, parseShoppingSearch, shoppingFilter } from './shopping';

const ID = '11111111-1111-4111-8111-111111111111';

describe('shopping filters', () => {
  it('keeps sensible filters from the URL and drops the rest', () => {
    expect(
      parseShoppingSearch({
        room: 'house',
        category: ID,
        status: 'purchased',
        phase: 'nope',
        x: 1,
      }),
    ).toEqual({ room: 'house', category: ID, status: 'purchased' });
    expect(parseShoppingSearch({ status: 'bought', job: ID })).toEqual({ job: ID });
  });

  it('turns them into the API filter; "house" means whole-house lines', () => {
    expect(shoppingFilter({ room: 'house', status: 'to_buy' })).toEqual({
      roomId: null,
      status: 'to_buy',
    });
    expect(shoppingFilter({ room: ID, job: ID })).toEqual({ roomId: ID, jobId: ID });
    expect(shoppingFilter({})).toEqual({});
  });

  it('says where a line goes', () => {
    expect(lineWhere({ room: { name: 'Kitchen' } })).toBe('Kitchen');
    expect(lineWhere({ room: null })).toBe('Whole house');
  });
});
