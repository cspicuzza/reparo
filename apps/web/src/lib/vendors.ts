/** What a vendor picker or list needs to show a vendor. */
export type VendorOption = { id: string; name: string; trade: string; archived: boolean };

/** Search as you type: the name or what they do contains the text, ignoring case. */
export function matchesVendor(v: Pick<VendorOption, 'name' | 'trade'>, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (q === '') return true;
  return v.name.toLowerCase().includes(q) || v.trade.toLowerCase().includes(q);
}

/** Live vendors, plus a job's own vendor if it has been archived since it was picked. */
export function vendorOptions<V extends VendorOption>(live: V[], current: V | null): V[] {
  if (!current || live.some((v) => v.id === current.id)) return live;
  return [...live, current];
}

/** A `tel:` link from a phone number as typed: digits and a leading +, nothing else. */
export function telHref(phone: string): string {
  const trimmed = phone.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return `tel:${plus}${trimmed.replace(/\D/g, '')}`;
}

/** "On 1 job", "On 3 jobs", "Not on any job yet". */
export function jobCountText(n: number): string {
  if (n === 0) return 'Not on any job yet';
  return `On ${n} ${n === 1 ? 'job' : 'jobs'}`;
}
