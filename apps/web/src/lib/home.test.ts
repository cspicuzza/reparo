import { describe, expect, it } from 'vitest';
import type { WorkStatusInput } from '@reparo/shared';
import { greeting, homeRoomOrder, phaseGlance, phaseHeading } from './home';

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
    const g = phaseGlance(jobs);
    expect([g.started, g.done, g.total]).toEqual([2, 1, 3]);
  });
  it('shows only the jobs underway or waiting on someone', () => {
    const jobs = [job('unstarted'), job('in_progress'), job('awaiting_review'), job('completed')];
    expect(phaseGlance(jobs).moving.map((j) => j.name)).toEqual(['in_progress', 'awaiting_review']);
  });
});

describe('phaseHeading (OD-116, Q119)', () => {
  const p1 = (status: 'planned' | 'active' | 'complete') => ({ name: 'Phase 1', status });
  const g = (started: number, done: number, total: number) => ({ started, done, total });
  it('says what the jobs say, not just the flag', () => {
    expect(phaseHeading(p1('active'), g(0, 0, 12))).toBe(
      'Phase 1 is underway; no job has started yet',
    );
    expect(phaseHeading(p1('active'), g(3, 1, 12))).toBe('Phase 1 is underway');
    expect(phaseHeading(p1('active'), g(12, 12, 12))).toBe(
      'Phase 1 is underway; every job is done',
    );
    expect(phaseHeading(p1('active'), g(0, 0, 0))).toBe('Phase 1 is underway; it has no jobs yet');
  });
  it('names a planned or finished phase, or none', () => {
    expect(phaseHeading(p1('planned'), g(0, 0, 4))).toBe('Phase 1 is next');
    expect(phaseHeading(p1('complete'), g(4, 4, 4))).toBe('Phase 1 is complete');
    expect(phaseHeading(null, g(0, 0, 0))).toBe('No phases yet');
  });
});

describe('homeRoomOrder (OD-116, Q120)', () => {
  const room = (name: string, awaitingReview = false, underway = false) => ({
    name,
    awaitingReview,
    underway,
  });
  it('puts rooms needing someone first, then work in progress, then the rest', () => {
    const rooms = [room('Bath'), room('Den', false, true), room('Hall', true), room('Kitchen')];
    expect(homeRoomOrder(rooms).map((r) => r.name)).toEqual(['Hall', 'Den', 'Bath', 'Kitchen']);
  });
});
