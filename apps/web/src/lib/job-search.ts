import { searchId } from './search-id';

/** A job page's address: `?estimate=<id>` opens that estimate to edit (OD-119, Q145). */
export type JobSearch = { estimate?: string };

/** The Jobs list's address: `?phase=<id>` shows one phase's jobs (OD-122, Q156). */
export type JobsSearch = { phase?: string };

/** Keep `phase` only when it's an id. */
export function parseJobsSearch(raw: Record<string, unknown>): JobsSearch {
  const phase = searchId(raw['phase']);
  return phase ? { phase } : {};
}

/** Keep `estimate` only when it's an id; anything else in the URL is dropped. */
export function parseJobSearch(raw: Record<string, unknown>): JobSearch {
  const estimate = searchId(raw['estimate']);
  return estimate ? { estimate } : {};
}
