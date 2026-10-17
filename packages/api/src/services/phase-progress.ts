import type { Db } from '@reparo/db';
import { listJobs } from './jobs';
import { getMoneySummary } from './money';
import { listPhases } from './phases';

export type PhaseProgress = {
  /** Jobs in the phase that are Completed (rolled up from their rooms). */
  done: number;
  /** Jobs counted: every live job in the phase except Cancelled ones. */
  total: number;
};

/**
 * Every phase with how many of its jobs are done, for the Phases list. Uses each job's rolled-up
 * status (jobs service), so a job counts as done only when all its counted rooms are. Kept out of
 * the phases service because jobs already depends on it.
 */
export async function listPhasesWithProgress(db: Db) {
  const [phases, jobs] = await Promise.all([listPhases(db), listJobs(db)]);
  return phases.map((phase) => {
    const counted = jobs.filter((j) => j.phaseId === phase.id && j.progress.status !== 'cancelled');
    const progress: PhaseProgress = {
      done: counted.filter((j) => j.progress.status === 'completed').length,
      total: counted.length,
    };
    return { ...phase, progress };
  });
}

/**
 * The Phases page's list (OD-123, Q155): each phase with its progress and its money, the same
 * figures as Money's By phase table (`money.summary`): spent, still to come, and for a phase
 * that isn't counted yet what it would leave.
 */
export async function listPhasesForPage(db: Db) {
  const [phases, summary] = await Promise.all([listPhasesWithProgress(db), getMoneySummary(db)]);
  const byId = new Map(summary.byPhase.map((p) => [p.id, p]));
  return phases.map((phase) => {
    const m = byId.get(phase.id);
    return {
      ...phase,
      money: {
        spentCents: m?.spentCents ?? 0,
        toComeCents: m?.toComeCents ?? 0,
        leavesCents: m?.leavesCents ?? null,
      },
    };
  });
}
