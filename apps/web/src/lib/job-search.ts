/** A job page's address: `?estimate=<id>` opens that estimate to edit (OD-119, Q145). */
export type JobSearch = { estimate?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep `estimate` only when it's an id; anything else in the URL is dropped. */
export function parseJobSearch(raw: Record<string, unknown>): JobSearch {
  const estimate = raw['estimate'];
  return typeof estimate === 'string' && UUID.test(estimate) ? { estimate } : {};
}
