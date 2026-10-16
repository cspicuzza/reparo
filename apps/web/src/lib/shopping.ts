import type { RouterOutputs } from '@reparo/api';
import { SHOPPING_STATUSES, type ShoppingStatusInput } from '@reparo/shared';

export type ShoppingLine = RouterOutputs['shoppingLines']['list'][number];

/** The Shopping page's filters, as they sit in the URL (shareable, web.md). */
export type ShoppingSearch = {
  /** A room id, or "house" for whole-house lines. */
  room?: string;
  category?: string;
  phase?: string;
  status?: ShoppingStatusInput;
  job?: string;
  /** A store name, as the list shows it (OD-75). */
  store?: string;
  /** Search text (OD-98). */
  q?: string;
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
  const status = raw['status'];
  if (typeof status === 'string' && (SHOPPING_STATUSES as readonly string[]).includes(status)) {
    out.status = status as ShoppingStatusInput;
  }
  const job = id(raw['job']);
  if (job) out.job = job;
  const store = raw['store'];
  if (typeof store === 'string' && store.trim() !== '' && store.length <= 120) {
    out.store = store.trim();
  }
  const q = raw['q'];
  if (typeof q === 'string' && q.trim() !== '' && q.length <= 120) out.q = q.trim();
  return out;
}

/** The filters as `shoppingLines.list` takes them. */
export function shoppingFilter(s: ShoppingSearch) {
  return {
    ...(s.room === 'house' ? { roomId: null } : s.room ? { roomId: s.room } : {}),
    ...(s.category ? { categoryId: s.category } : {}),
    ...(s.phase ? { phaseId: s.phase } : {}),
    ...(s.status ? { status: s.status } : {}),
    ...(s.job ? { jobId: s.job } : {}),
    ...(s.store ? { store: s.store } : {}),
    ...(s.q ? { q: s.q } : {}),
  };
}

/** Where a line goes: its room, or the whole house. */
export const lineWhere = (l: { room: { name: string } | null }) => l.room?.name ?? 'Whole house';

/** What a section or room group holds, in words: "4 to buy, $3,120.00" (OD-75). */
export function groupText(
  status: ShoppingStatusInput,
  count: number,
  cents: number,
  money: (c: number) => string,
): string {
  if (status === 'to_buy') return `${count} to buy, ${money(cents)}`;
  if (status === 'purchased') return `${count} bought, ${money(cents)} paid`;
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
