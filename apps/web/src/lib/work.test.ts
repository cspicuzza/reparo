import { describe, expect, it } from 'vitest';
import { specSummary, WORK_STATUS_LABEL } from './work';

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
});
