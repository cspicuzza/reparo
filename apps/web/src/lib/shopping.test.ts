import { describe, expect, it } from 'vitest';
import { money } from './money';
import {
  groupText,
  lineDetails,
  lineWhere,
  parseShoppingSearch,
  shoppingFilter,
  summaryText,
} from './shopping';

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
    ).toEqual({ room: 'house', category: ID });
    // Status was a filter once; an old link's status is dropped (OD-106).
    expect(parseShoppingSearch({ status: 'to_buy', job: ID })).toEqual({ job: ID });
    expect(parseShoppingSearch({ store: ' Wayfair ' })).toEqual({ store: 'Wayfair' });
    expect(parseShoppingSearch({ store: '   ' })).toEqual({});
    expect(parseShoppingSearch({ q: ' fan ' })).toEqual({ q: 'fan' });
    expect(parseShoppingSearch({ q: '' })).toEqual({});
  });

  it('turns them into the API filter; "house" means whole-house lines', () => {
    expect(shoppingFilter({ room: 'house' })).toEqual({ roomId: null });
    expect(shoppingFilter({ room: ID, job: ID })).toEqual({ roomId: ID, jobId: ID });
    expect(shoppingFilter({})).toEqual({});
    expect(shoppingFilter({ store: 'Wayfair' })).toEqual({ store: 'Wayfair' });
  });

  it('says where a line goes', () => {
    expect(lineWhere({ room: { name: 'Kitchen' } })).toBe('Kitchen');
    expect(lineWhere({ room: null })).toBe('Whole house');
  });
});

describe('shopping words (OD-75)', () => {
  it('says what a group holds for each status', () => {
    expect(groupText('to_buy', 4, 312000, money)).toBe('4 to buy, $3,120.00');
    expect(groupText('purchased', 2, 4500, money)).toBe('2 bought, $45.00 paid');
    expect(groupText('returned', 1, 5000, money)).toBe('1 returned, $50.00 not refunded');
  });
  it('opens the page with what is left to buy', () => {
    expect(summaryText(0, 0, money)).toBe('Nothing left to buy.');
    expect(summaryText(1, 999, money)).toBe('1 thing to buy, $9.99 in all.');
    expect(summaryText(38, 1420000, money)).toBe('38 things to buy, $14,200.00 in all.');
    expect(summaryText(4, 184000, money, 'fan')).toBe('4 to buy match “fan”, $1,840.00 in all.');
    expect(summaryText(1, 999, money, 'rug')).toBe('1 to buy matches “rug”, $9.99 in all.');
    expect(summaryText(0, 0, money, 'zz')).toBe('Nothing to buy matches “zz”.');
  });
});

describe('lineDetails (OD-78)', () => {
  const phase = { name: 'Phase 1', status: 'active' as const };
  it('gives how many and a planned phase; the store is its own link (OD-82)', () => {
    expect(lineDetails({ quantity: 2, phase })).toBe('2 of them');
    expect(lineDetails({ quantity: 1, phase })).toBe('');
    expect(lineDetails({ quantity: 1, phase: { name: 'Phase 2', status: 'planned' } })).toBe(
      'Phase 2 (planned)',
    );
  });
});
