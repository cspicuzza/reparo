import { describe, expect, it } from 'vitest';
import type { WorkStatusInput } from '@reparo/shared';
import { greeting, phaseGlance } from './home';

const at = (h: number) => new Date(2026, 9, 14, h, 30);

describe('greeting', () => {
  it('follows the time of day', () => {
    expect(greeting(at(8), 'Chris')).toBe('Good morning, Chris.');
    expect(greeting(at(13), 'Chris')).toBe('Good afternoon, Chris.');
    expect(greeting(at(19), 'Chris')).toBe('Good evening, Chris.');
    expect(greeting(at(2), 'Chris')).toBe('Good evening, Chris.');
  });

  it('uses the first name, or none', () => {
    expect(greeting(at(9), 'Chris Spicuzza')).toBe('Good morning, Chris.');
    expect(greeting(at(9))).toBe('Good morning.');
    expect(greeting(at(9), '  ')).toBe('Good morning.');
  });
});

describe('phaseGlance (OD-92)', () => {
  const job = (status: WorkStatusInput, name = status) => ({ name, progress: { status } });
  it('counts started and done, leaving out cancelled jobs', () => {
    const jobs = [job('unstarted'), job('in_progress'), job('completed'), job('cancelled')];
    expect(phaseGlance(jobs).text).toBe('2 of 3 jobs started, 1 done');
    expect(phaseGlance([job('unstarted')]).text).toBe('0 of 1 job started');
  });
  it('shows only the jobs under way or waiting on someone', () => {
    const jobs = [job('unstarted'), job('in_progress'), job('awaiting_review'), job('completed')];
    expect(phaseGlance(jobs).moving.map((j) => j.name)).toEqual(['in_progress', 'awaiting_review']);
  });
});
