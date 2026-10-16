/**
 * Keeps picture links steady across refetches (OD-115, Q136, Q172). Storage signs a fresh link
 * every time a list is fetched (each with a new token, valid an hour; observed 2026-10-16), and
 * a new link means the browser downloads the picture again. So when a fetch brings a new link
 * for an object it already has a link for, the older one is kept while it's under 45 minutes
 * old, leaving 15 minutes before it runs out. Links are matched by the object's path, which is
 * the part before the query string.
 */

const SIGNED = '/storage/v1/object/sign/';
/** How long a link is reused: links last an hour (`VIEW_SECONDS` in the API). */
export const KEEP_LINK_MS = 45 * 60 * 1000;

type Seen = { url: string; at: number };

/** Remembers the link in use for each object; one per app. */
export function createLinkKeeper(now: () => number = Date.now) {
  const seen = new Map<string, Seen>();

  const keep = (url: string): string => {
    const key = url.split('?')[0] ?? url;
    const t = now();
    const had = seen.get(key);
    if (had && t - had.at < KEEP_LINK_MS) return had.url;
    seen.set(key, { url, at: t });
    return url;
  };

  /** A copy of `data` with every signed storage link swapped for the one already in use. */
  const stabilize = (data: unknown): unknown => {
    if (typeof data === 'string') return data.includes(SIGNED) ? keep(data) : data;
    if (Array.isArray(data)) return data.map(stabilize);
    if (data && typeof data === 'object' && Object.getPrototypeOf(data) === Object.prototype) {
      return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, stabilize(v)]));
    }
    return data;
  };

  return { stabilize };
}
