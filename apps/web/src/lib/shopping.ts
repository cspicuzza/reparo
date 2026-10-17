import type { RouterOutputs } from '@reparo/api';
import type { ShoppingStatusInput } from '@reparo/shared';

export type ShoppingLine = RouterOutputs['shoppingLines']['list'][number];

/**
 * The Shopping page's filters, as they sit in the URL (shareable, web.md). There's no status:
 * the sections do that job, and an old link's `status` is dropped (OD-106, Q110).
 */
export type ShoppingSearch = {
  /** A room id, or "house" for whole-house lines. */
  room?: string;
  category?: string;
  phase?: string;
  job?: string;
  /** A store name, as the list shows it (OD-75). */
  store?: string;
  /** Search text (OD-98). */
  q?: string;
  /** Group the list by store instead of room (OD-137). Not a filter. */
  group?: 'store';
  /** Only things still to buy with no price yet (OD-143). */
  unpriced?: true;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : undefined);

/** Keep only filters that make sense; anything else in the URL is dropped. */
export function parseShoppingSearch(raw: Record<string, unknown>): ShoppingSearch {
  const out: ShoppingSearch = {};
  const room = raw['room'] === 'house' ? 'house' : id(raw['room']);
  if (room) out.room = room;
  const category = id(raw['category']);
  if (category) out.category = category;
  const phase = id(raw['phase']);
  if (phase) out.phase = phase;
  const job = id(raw['job']);
  if (job) out.job = job;
  const store = raw['store'];
  if (typeof store === 'string' && store.trim() !== '' && store.length <= 120) {
    out.store = store.trim();
  }
  const q = raw['q'];
  if (typeof q === 'string' && q.trim() !== '' && q.length <= 120) out.q = q.trim();
  if (raw['group'] === 'store') out.group = 'store';
  if (raw['unpriced'] === true || raw['unpriced'] === 1 || raw['unpriced'] === '1') {
    out.unpriced = true;
  }
  return out;
}

/** The filters in use: everything in the search but the search text and the grouping. */
export function activeFilters(s: ShoppingSearch) {
  return (Object.keys(s) as (keyof ShoppingSearch)[]).filter(
    (k): k is Exclude<keyof ShoppingSearch, 'q' | 'group'> =>
      k !== 'q' && k !== 'group' && s[k] !== undefined,
  );
}

/** A line's store as `totals` groups it ("" for none), matching a store group's `key`. */
export const storeKey = (l: { store: string }) => l.store.trim().toLowerCase();

/** The filters as `shoppingLines.list` takes them. */
export function shoppingFilter(s: ShoppingSearch) {
  return {
    ...(s.room === 'house' ? { roomId: null } : s.room ? { roomId: s.room } : {}),
    ...(s.category ? { categoryId: s.category } : {}),
    ...(s.phase ? { phaseId: s.phase } : {}),
    ...(s.job ? { jobId: s.job } : {}),
    ...(s.store ? { store: s.store } : {}),
    ...(s.q ? { q: s.q } : {}),
    ...(s.unpriced ? { unpriced: true as const } : {}),
  };
}

/** Where a line goes: its room, or the whole house. */
export const lineWhere = (l: { room: { name: string } | null }) => l.room?.name ?? 'Whole house';

/**
 * What a section or room group holds, in words: "4 to buy, $3,120.00" (OD-75). Things with no
 * price yet are said, never added in as $0.00: "9 to buy, $5,960.00, 1 with no price", or "1 to
 * buy, no prices yet" when none is priced (OD-143, Q212).
 */
export function groupText(
  status: ShoppingStatusInput,
  count: number,
  cents: number,
  money: (c: number) => string,
  unpriced = 0,
): string {
  if (status === 'to_buy') {
    if (unpriced >= count && count > 0) return `${count} to buy, no prices yet`;
    const priced = `${count} to buy, ${money(cents)}`;
    return unpriced > 0 ? `${priced}, ${unpriced} with no price` : priced;
  }
  if (status === 'purchased') return `${count} bought, ${money(cents)} paid`;
  // Nothing left out of pocket reads as that, not as "$0.00 not refunded" (OD-145).
  if (cents === 0) return `${count} returned, all refunded`;
  return `${count} returned, ${money(cents)} not refunded`;
}

/**
 * The page's opening sentence: what's left to buy under the current filters (OD-75, Q26), or
 * what's left to buy that matches a search (OD-98, Q84).
 */
export function summaryText(
  count: number,
  cents: number,
  money: (c: number) => string,
  q?: string,
): string {
  if (q !== undefined) {
    if (count === 0) return `Nothing to buy matches “${q}”.`;
    return `${count} to buy ${count === 1 ? 'matches' : 'match'} “${q}”, ${money(cents)} in all.`;
  }
  if (count === 0) return 'Nothing left to buy.';
  return `${count} ${count === 1 ? 'thing' : 'things'} to buy, ${money(cents)} in all.`;
}

/**
 * "2 of them": how many and a planned phase, the details you check while ordering (OD-78). The
 * store is shown beside them as a link to the product page (OD-82).
 */
export function lineDetails(line: {
  quantity: number;
  phase: { name: string; status: 'planned' | 'active' | 'complete' };
}): string {
  return [
    line.quantity > 1 ? `${line.quantity} of them` : null,
    line.phase.status === 'planned' ? `${line.phase.name} (planned)` : null,
  ]
    .filter((d): d is string => d !== null)
    .join(', ');
}
