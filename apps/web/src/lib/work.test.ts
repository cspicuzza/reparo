import { describe, expect, it } from 'vitest';
import {
  WORK_STATUS_LABEL,
  phaseDates,
  phaseProgressText,
  progressText,
  specSummary,
} from './work';

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

describe('phaseProgressText', () => {
  it('counts jobs done', () => {
    expect(phaseProgressText({ done: 3, total: 8 })).toBe('3 of 8 jobs done');
    expect(phaseProgressText({ done: 8, total: 8 })).toBe('All 8 jobs done');
    expect(phaseProgressText({ done: 0, total: 0 })).toBe('No jobs yet');
  });
});

describe('phaseDates', () => {
  it('shows the range, or whichever end is set', () => {
    expect(phaseDates({ startsOn: '2026-10-01', endsOn: '2026-12-15' })).toBe(
      'Oct 1, 2026 to Dec 15, 2026',
    );
    expect(phaseDates({ startsOn: '2026-10-01', endsOn: null })).toBe('Starts Oct 1, 2026');
    expect(phaseDates({ startsOn: null, endsOn: '2026-12-15' })).toBe('Ends Dec 15, 2026');
    expect(phaseDates({ startsOn: null, endsOn: null })).toBe('');
  });
});
