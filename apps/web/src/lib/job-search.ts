/** A job page's address: `?estimate=<id>` opens that estimate to edit (OD-119, Q145). */
export type JobSearch = { estimate?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The Jobs list's address: `?phase=<id>` shows one phase's jobs (OD-122, Q156). */
export type JobsSearch = { phase?: string };

/** Keep `phase` only when it's an id. */
export function parseJobsSearch(raw: Record<string, unknown>): JobsSearch {
  const phase = raw['phase'];
  return typeof phase === 'string' && UUID.test(phase) ? { phase } : {};
}

/** Keep `estimate` only when it's an id; anything else in the URL is dropped. */
export function parseJobSearch(raw: Record<string, unknown>): JobSearch {
  const estimate = raw['estimate'];
  return typeof estimate === 'string' && UUID.test(estimate) ? { estimate } : {};
}
