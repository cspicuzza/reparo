import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  items,
  jobRooms,
  jobs,
  phases,
  rooms,
  type Db,
  type JobRoom,
  type WorkStatus,
} from '@reparo/db';
import type { JobCreate, JobList, JobRoomCreate, JobRoomUpdate, JobUpdate } from '@reparo/shared';
import { badRequest, conflict, isUniqueViolation, notFound } from './errors';
import { getItem } from './items';
import { getPhase } from './phases';
import { getRoom } from './rooms';

// Jobs and the rooms they cover (Model fix; Linear *Data model* doc). A job holds the
// house-wide spec; each covered room has its own status and either uses the job's spec
// (`spec` null) or its own.

const liveJob = () => isNull(jobs.deletedAt);
const liveJobRoom = () => isNull(jobRooms.deletedAt);

export type Progress = {
  /** The job's status: rolled up from its rooms, or its own when it covers none. */
  status: WorkStatus;
  /** Rooms Completed. */
  done: number;
  /** Rooms counted: every covered room except Cancelled ones. */
  total: number;
};

/**
 * Roll-up rule (Chris, 2026-10-14). Cancelled rooms don't count. All Cancelled → Cancelled;
 * all Unstarted → Unstarted; all Completed → Completed; all Completed or Awaiting review with
 * at least one Awaiting review → Awaiting review; anything else → In progress.
 */
export function rollUp(roomStatuses: WorkStatus[], ownStatus: WorkStatus): Progress {
  if (roomStatuses.length === 0) return { status: ownStatus, done: 0, total: 0 };
  const counted = roomStatuses.filter((s) => s !== 'cancelled');
  const done = counted.filter((s) => s === 'completed').length;
  const total = counted.length;
  const all = (pred: (s: WorkStatus) => boolean) => counted.every(pred);
  let status: WorkStatus;
  if (total === 0) status = 'cancelled';
  else if (all((s) => s === 'unstarted')) status = 'unstarted';
  else if (all((s) => s === 'completed')) status = 'completed';
  else if (all((s) => s === 'completed' || s === 'awaiting_review')) status = 'awaiting_review';
  else status = 'in_progress';
  return { status, done, total };
}

/** A covered room's spec as it applies: its own if it has one, else the job's. */
function resolve(jobSpec: string, room: Pick<JobRoom, 'spec'>) {
  return room.spec === null
    ? { resolvedSpec: jobSpec, specSource: 'job' as const }
    : { resolvedSpec: room.spec, specSource: 'room' as const };
}

/** Live jobs in live phases, with item, phase, covered rooms (live) and progress. */
async function loadJobs(db: Db, filter: JobList & { id?: string }) {
  const conds = [liveJob(), isNull(phases.deletedAt)];
  if (filter.id !== undefined) conds.push(eq(jobs.id, filter.id));
  if (filter.phaseId !== undefined) conds.push(eq(jobs.phaseId, filter.phaseId));
  if (filter.itemId !== undefined) conds.push(eq(jobs.itemId, filter.itemId));

  const rows = await db
    .select({
      job: jobs,
      item: { id: items.id, name: items.name, categoryId: items.categoryId },
      phase: { id: phases.id, name: phases.name, status: phases.status },
    })
    .from(jobs)
    .innerJoin(items, eq(items.id, jobs.itemId))
    .innerJoin(phases, eq(phases.id, jobs.phaseId))
    .where(and(...conds))
    .orderBy(asc(phases.sortOrder), asc(jobs.sortOrder), asc(items.sortOrder), asc(jobs.createdAt));
  if (rows.length === 0) return [];

  const covered = await db
    .select({ jobRoom: jobRooms, room: { id: rooms.id, name: rooms.name } })
    .from(jobRooms)
    .innerJoin(rooms, eq(rooms.id, jobRooms.roomId))
    .where(
      and(
        liveJobRoom(),
        isNull(rooms.deletedAt),
        inArray(
          jobRooms.jobId,
          rows.map((r) => r.job.id),
        ),
      ),
    )
    .orderBy(asc(rooms.sortOrder), asc(rooms.name));

  return rows.map(({ job, item, phase }) => {
    const mine = covered
      .filter((c) => c.jobRoom.jobId === job.id)
      .map((c) => ({ ...c.jobRoom, room: c.room, ...resolve(job.spec, c.jobRoom) }));
    return {
      ...job,
      item,
      phase,
      rooms: mine,
      progress: rollUp(
        mine.map((r) => r.status),
        job.status,
      ),
    };
  });
}

export function listJobs(db: Db, filter: JobList = {}) {
  return loadJobs(db, filter);
}

export async function getJob(db: Db, id: string) {
  const [job] = await loadJobs(db, { id });
  if (!job) throw notFound('Job');
  return job;
}

async function liveRoomIds(db: Db, jobId: string) {
  const rows = await db
    .select({ id: jobRooms.id })
    .from(jobRooms)
    .innerJoin(rooms, eq(rooms.id, jobRooms.roomId))
    .where(and(eq(jobRooms.jobId, jobId), liveJobRoom(), isNull(rooms.deletedAt)));
  return rows.map((r) => r.id);
}

export async function createJob(db: Db, { roomIds, ...input }: JobCreate) {
  const item = await getItem(db, input.itemId);
  if (item.retiredAt) throw badRequest(`"${item.name}" is retired; restore it to add work`);
  const phase = await getPhase(db, input.phaseId);
  for (const roomId of roomIds) await getRoom(db, roomId);
  if (roomIds.length > 0 && input.status !== 'unstarted') {
    throw badRequest("A job that covers rooms takes its status from them; set each room's status");
  }
  const name = input.name === '' ? `${item.name} — ${phase.name}` : input.name;

  const id = await db.transaction(async (tx) => {
    const [job] = await tx
      .insert(jobs)
      .values({ ...input, name })
      .returning();
    if (!job) throw new Error('insert returned no row');
    if (roomIds.length > 0) {
      await tx.insert(jobRooms).values(roomIds.map((roomId) => ({ jobId: job.id, roomId })));
    }
    return job.id;
  });
  return getJob(db, id);
}

/** Phase, name, spec, notes, order — and status only when the job covers no rooms. */
export async function updateJob(db: Db, { id, ...patch }: JobUpdate) {
  await getJob(db, id);
  if (patch.phaseId !== undefined) await getPhase(db, patch.phaseId);
  if (patch.status !== undefined && (await liveRoomIds(db, id)).length > 0) {
    throw badRequest("This job takes its status from its rooms; set each room's status");
  }
  await db
    .update(jobs)
    .set(patch)
    .where(and(eq(jobs.id, id), liveJob()));
  return getJob(db, id);
}

/** Soft-delete. Its rooms are hidden with it and come back on restore. */
export async function removeJob(db: Db, id: string) {
  await getJob(db, id);
  await db.update(jobs).set({ deletedAt: new Date() }).where(eq(jobs.id, id));
  return { id };
}

export async function restoreJob(db: Db, id: string) {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!row) throw notFound('Job');
  if (row.deletedAt !== null) {
    await db.update(jobs).set({ deletedAt: null }).where(eq(jobs.id, id));
  }
  return getJob(db, id);
}

// --- rooms a job covers ----------------------------------------------------------------------

async function getJobRoom(db: Db, id: string) {
  const [row] = await db
    .select({ jobRoom: jobRooms })
    .from(jobRooms)
    .innerJoin(jobs, eq(jobs.id, jobRooms.jobId))
    .where(and(eq(jobRooms.id, id), liveJobRoom(), liveJob()));
  if (!row) throw notFound('Room on this job');
  return row.jobRoom;
}

/** Cover one more room. A room that was removed from the job can be added back. */
export async function addJobRoom(db: Db, input: JobRoomCreate) {
  const job = await getJob(db, input.jobId);
  const room = await getRoom(db, input.roomId);
  try {
    await db.insert(jobRooms).values(input);
  } catch (e) {
    if (isUniqueViolation(e, 'job_rooms_job_room_live_uidx')) {
      throw conflict(`"${job.name}" already covers ${room.name}`);
    }
    throw e;
  }
  return getJob(db, job.id);
}

/** This room's status, its own spec (blank → same as the job), notes, order. */
export async function updateJobRoom(db: Db, { id, ...patch }: JobRoomUpdate) {
  const current = await getJobRoom(db, id);
  await db.update(jobRooms).set(patch).where(eq(jobRooms.id, id));
  return getJob(db, current.jobId);
}

/** Stop covering a room (soft-delete). */
export async function removeJobRoom(db: Db, id: string) {
  const current = await getJobRoom(db, id);
  await db.update(jobRooms).set({ deletedAt: new Date() }).where(eq(jobRooms.id, id));
  return getJob(db, current.jobId);
}

/** The room view: every live job covering this room, with the room's status and spec. */
export async function jobsForRoom(db: Db, roomId: string) {
  await getRoom(db, roomId);
  const rows = await db
    .select({
      jobRoom: jobRooms,
      job: jobs,
      item: { id: items.id, name: items.name, categoryId: items.categoryId },
      phase: { id: phases.id, name: phases.name, status: phases.status },
    })
    .from(jobRooms)
    .innerJoin(jobs, eq(jobs.id, jobRooms.jobId))
    .innerJoin(items, eq(items.id, jobs.itemId))
    .innerJoin(phases, eq(phases.id, jobs.phaseId))
    .where(and(eq(jobRooms.roomId, roomId), liveJobRoom(), liveJob(), isNull(phases.deletedAt)))
    .orderBy(asc(phases.sortOrder), asc(items.sortOrder), asc(jobs.sortOrder));
  return rows.map(({ jobRoom, job, item, phase }) => ({
    ...jobRoom,
    ...resolve(job.spec, jobRoom),
    job: { id: job.id, name: job.name, spec: job.spec, notes: job.notes },
    item,
    phase,
  }));
}
