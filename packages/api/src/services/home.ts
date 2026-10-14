import type { Db } from '@reparo/db';
import { listJobs } from './jobs';
import { listPhases } from './phases';
import { listRooms, roomsProgress } from './rooms';

/**
 * Everything Home shows (OD-41), in one read: what needs someone, the current phase's jobs and
 * how far along each room is. Counts come from here, not the browser (web.md). Money joins in M2;
 * deliveries and deposits join "needs you" in M2 and M3.
 */
/** Something waiting for someone to check it: a job in one room, or a job with no rooms. */
export type NeedsYou = {
  id: string;
  jobName: string;
  itemId: string;
  room: { id: string; name: string } | null;
};

export async function homeSummary(db: Db) {
  const allJobs = await listJobs(db);
  const allPhases = await listPhases(db);
  const allRooms = await listRooms(db);
  const progress = await roomsProgress(db);

  // A job covering rooms waits per room; a job with no rooms (a fee) waits as a whole.
  const needsYou = allJobs.flatMap<NeedsYou>((job) =>
    job.rooms.length > 0
      ? job.rooms
          .filter((r) => r.status === 'awaiting_review')
          .map((r) => ({ id: r.id, jobName: job.name, itemId: job.itemId, room: r.room }))
      : job.progress.status === 'awaiting_review'
        ? [{ id: job.id, jobName: job.name, itemId: job.itemId, room: null }]
        : [],
  );

  // The current phase: the first active one, else the first one still planned.
  const current =
    allPhases.find((p) => p.status === 'active') ??
    allPhases.find((p) => p.status === 'planned') ??
    null;

  return {
    needsYou,
    phase: current ? { id: current.id, name: current.name, status: current.status } : null,
    phaseJobs: current
      ? allJobs
          .filter((j) => j.phaseId === current.id)
          .map((j) => ({
            id: j.id,
            name: j.name,
            itemId: j.itemId,
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
      };
    }),
  };
}
