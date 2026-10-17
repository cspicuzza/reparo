import type { Db } from '@reparo/db';
import { expiringEstimates } from './estimates';
import { listJobs } from './jobs';
import { getMoneySummary } from './money';
import { listPhasesWithProgress } from './phase-progress';
import { listRooms, roomsProgress } from './rooms';

/**
 * Everything Home shows (OD-41), in one read: what needs someone, the current phase's jobs and
 * how far along each room is, and the money headline. Counts come from here, not the browser
 * (web.md).
 */
/** Something waiting for someone to check it: a job in one room, or a job with no rooms. */
export type NeedsYou = {
  id: string;
  jobId: string;
  jobName: string;
  room: { id: string; name: string } | null;
};

export async function homeSummary(db: Db) {
  // Independent reads, so they run at the same time (OD-153).
  const [allJobs, allPhases, allRooms, progress, money] = await Promise.all([
    listJobs(db),
    listPhasesWithProgress(db),
    listRooms(db),
    roomsProgress(db),
    getMoneySummary(db),
  ]);

  // A job covering rooms waits per room; a job with no rooms (a fee) waits as a whole.
  const needsYou = allJobs.flatMap<NeedsYou>((job) =>
    job.rooms.length > 0
      ? job.rooms
          .filter((r) => r.status === 'awaiting_review')
          .map((r) => ({ id: r.id, jobId: job.id, jobName: job.name, room: r.room }))
      : job.progress.status === 'awaiting_review'
        ? [{ id: job.id, jobId: job.id, jobName: job.name, room: null }]
        : [],
  );

  // The current phase: the first active one, else the first one still planned.
  const current =
    allPhases.find((p) => p.status === 'active') ??
    allPhases.find((p) => p.status === 'planned') ??
    null;

  return {
    /** The money headline (M3): left to spend, and what each planned phase would need. */
    money: {
      poolCents: money.pool.poolCents,
      spentCents: money.spentCents,
      committedCents: money.committedCents,
      availableCents: money.availableCents,
      unpricedCount: money.unpricedCount,
      countingPhases: money.byPhase.filter((p) => p.counting).map((p) => p.name),
      plannedPhases: money.byPhase
        .filter((p) => !p.counting)
        .map((p) => ({
          id: p.id,
          name: p.name,
          toComeCents: p.toComeCents,
          leavesCents: p.leavesCents,
        })),
    },
    needsYou,
    /** Received quotes that run out within a week (M4, Q4). */
    expiringQuotes: await expiringEstimates(db),
    /** With the same "done" count as the Phases list (OD-116, Q119). */
    phase: current
      ? { id: current.id, name: current.name, status: current.status, progress: current.progress }
      : null,
    phaseJobs: current
      ? allJobs
          .filter((j) => j.phaseId === current.id)
          .map((j) => ({
            id: j.id,
            name: j.name,
            roomCount: j.rooms.length,
            progress: j.progress,
          }))
      : [],
    rooms: allRooms.map((r) => {
      const p = progress.get(r.id);
      return {
        id: r.id,
        name: r.name,
        progress: { done: p?.done ?? 0, total: p?.total ?? 0 },
        awaitingReview: (p?.awaitingReview ?? 0) > 0,
        /** A job is in progress there (Home puts these rooms second, OD-116, Q120). */
        underway: (p?.underway ?? 0) > 0,
      };
    }),
  };
}
