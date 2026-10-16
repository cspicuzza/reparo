import type { Db } from '@reparo/db';
import { sumCents } from '@reparo/shared';
import { getRoomWithProgress } from './rooms';
import { shoppingTotals } from './shopping-lines';

/**
 * What's being bought for one room, for the room page's money tape (OD-118, Q143): bought is
 * what's been paid (less what came back), left is the price of what's still to buy, the same
 * sums as the Shopping page's tape filtered to this room. Kept out of the rooms service, which
 * the shopping-lines service already depends on.
 */
export async function roomShopping(db: Db, roomId: string) {
  const sections = await shoppingTotals(db, { roomId });
  const cents = (status: 'to_buy' | 'purchased' | 'returned') =>
    sections.find((s) => s.status === status)?.totalCents ?? 0;
  return {
    boughtCents: sumCents([cents('purchased'), cents('returned')]),
    leftCents: cents('to_buy'),
  };
}

/** The room page's room: its fields, progress, what's attached, and its shopping money. */
export async function getRoomDetail(db: Db, id: string) {
  const room = await getRoomWithProgress(db, id);
  return { ...room, shopping: await roomShopping(db, id) };
}
