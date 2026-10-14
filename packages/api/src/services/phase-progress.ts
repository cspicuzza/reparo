import type { Db } from '@reparo/db';
import { listJobs } from './jobs';
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
  const phases = await listPhases(db);
  const jobs = await listJobs(db);
  return phases.map((phase) => {
    const counted = jobs.filter((j) => j.phaseId === phase.id && j.progress.status !== 'cancelled');
    const progress: PhaseProgress = {
      done: counted.filter((j) => j.progress.status === 'completed').length,
      total: counted.length,
    };
    return { ...phase, progress };
  });
}
