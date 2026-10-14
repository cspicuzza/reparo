import { describe, expect, it } from 'vitest';
import { progressText, specSummary, WORK_STATUS_LABEL } from './work';

describe('work helpers', () => {
  it('labels every status', () => {
    expect(Object.keys(WORK_STATUS_LABEL)).toEqual([
      'unstarted',
      'in_progress',
      'awaiting_review',
      'completed',
      'cancelled',
    ]);
  });
  it('summarises the first non-empty line of a spec', () => {
    expect(specSummary('\n\n  SW Alabaster, eggshell  \nTwo coats')).toBe('SW Alabaster, eggshell');
    expect(specSummary('')).toBe('');
    expect(specSummary('x'.repeat(100), 10)).toBe('xxxxxxxxx…');
  });
  it('describes progress in rooms', () => {
    expect(progressText({ done: 6, total: 9 }, 9)).toBe('6 of 9 rooms done');
    expect(progressText({ done: 0, total: 1 }, 2)).toBe('0 of 1 room done');
    expect(progressText({ done: 0, total: 0 }, 2)).toBe('All rooms cancelled');
    expect(progressText({ done: 0, total: 0 }, 0)).toBe('');
  });
});
