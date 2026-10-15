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
  };
}

/** Where a line goes: its room, or the whole house. */
export const lineWhere = (l: { room: { name: string } | null }) => l.room?.name ?? 'Whole house';
