import { describe, expect, it } from 'vitest';
import { parseJobSearch, parseJobsSearch } from './job-search';

describe('parseJobSearch', () => {
  it('keeps an estimate id and drops anything else', () => {
    const id = '0b9a2d4e-5f61-4c7a-9d3e-2a1b4c5d6e7f';
    expect(parseJobSearch({ estimate: id })).toEqual({ estimate: id });
    expect(parseJobSearch({ estimate: 'x', other: 1 })).toEqual({});
    expect(parseJobSearch({})).toEqual({});
  });
});

describe('parseJobsSearch (OD-122)', () => {
  it('keeps a phase id and drops anything else', () => {
    const id = '7dbef66e-3a13-47c9-a0a2-cc7959c05451';
    expect(parseJobsSearch({ phase: id, other: 'x' })).toEqual({ phase: id });
    expect(parseJobsSearch({ phase: 'nope' })).toEqual({});
  });
});
