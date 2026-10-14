/** "Good afternoon, Chris." by the device's local time; the first name only. */
export function greeting(now: Date, displayName?: string): string {
  const h = now.getHours();
  const part = h < 5 ? 'evening' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? `Good ${part}, ${first}.` : `Good ${part}.`;
}
