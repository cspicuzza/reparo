import { describe, expect, it } from 'vitest';
import { parseJobSearch } from './job-search';

describe('parseJobSearch', () => {
  it('keeps an estimate id and drops anything else', () => {
    const id = '0b9a2d4e-5f61-4c7a-9d3e-2a1b4c5d6e7f';
    expect(parseJobSearch({ estimate: id })).toEqual({ estimate: id });
    expect(parseJobSearch({ estimate: 'x', other: 1 })).toEqual({});
    expect(parseJobSearch({})).toEqual({});
  });
});
