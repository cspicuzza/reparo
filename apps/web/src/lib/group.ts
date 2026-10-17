/**
 * Items grouped by a key, in their order, so each row looks its own up by id instead of
 * filtering the whole list (OD-157; vercel-react-best-practices `js-index-maps`).
 */
export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

/** Shared by rows that have nothing, so they don't each get a new empty array. */
export const NONE: readonly never[] = Object.freeze([]);
