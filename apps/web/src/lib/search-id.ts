/** Any UUID shape, the way ids sit in an address (`?vendor=`, `?phase=`, `?line=`). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id from the address, or undefined when it isn't one, so a bad link is just dropped. */
export const searchId = (v: unknown): string | undefined =>
  typeof v === 'string' && UUID.test(v) ? v : undefined;
