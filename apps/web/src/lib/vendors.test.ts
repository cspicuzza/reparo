import { describe, expect, it } from 'vitest';
import { jobCountText, matchesVendor, parseVendorsSearch, telHref, vendorOptions } from './vendors';

describe('vendor helpers', () => {
  it('matches the name or trade, ignoring case and spaces around the text', () => {
    const rr = { name: 'Rolland Reash', trade: 'Plumber' };
    expect(matchesVendor(rr, 'roll')).toBe(true);
    expect(matchesVendor(rr, ' PLUMB ')).toBe(true);
    expect(matchesVendor(rr, 'paint')).toBe(false);
    expect(matchesVendor(rr, '')).toBe(true);
  });

  it('keeps an archived current vendor in the options, once', () => {
    const live = [{ id: 'a', name: 'A', trade: '', archived: false }];
    const gone = { id: 'b', name: 'B', trade: '', archived: true };
    expect(vendorOptions(live, gone).map((v) => v.id)).toEqual(['a', 'b']);
    expect(vendorOptions(live, live[0] ?? null)).toBe(live);
    expect(vendorOptions(live, null)).toBe(live);
  });

  it('makes tel: links from typed numbers', () => {
    expect(telHref('(904) 555-0142')).toBe('tel:9045550142');
    expect(telHref(' +1 904 555 0142 ')).toBe('tel:+19045550142');
  });

  it('keeps a vendor id in the address and drops anything else', () => {
    const id = '0b9a2d4e-5f61-4c7a-9d3e-2a1b4c5d6e7f';
    expect(parseVendorsSearch({ vendor: id })).toEqual({ vendor: id });
    expect(parseVendorsSearch({ vendor: 'nope' })).toEqual({});
    expect(parseVendorsSearch({ vendor: 3, other: 'x' })).toEqual({});
    expect(parseVendorsSearch({})).toEqual({});
  });

  it('says how many jobs a vendor is on', () => {
    expect(jobCountText(0)).toBe('Not on any job yet');
    expect(jobCountText(1)).toBe('On 1 job');
    expect(jobCountText(4)).toBe('On 4 jobs');
  });
});
