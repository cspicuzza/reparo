import {
  and,
  asc,
  categories,
  eq,
  isNull,
  jobs,
  phases,
  rooms,
  shoppingLines,
  sql,
  type Db,
  type ShoppingLine,
} from '@reparo/db';
import type { ShoppingLineCreate, ShoppingLineList, ShoppingLineUpdate } from '@reparo/shared';
import { getCategory } from './categories';
import { badRequest, notFound } from './errors';
import { getPhase } from './phases';
import { getRoom } from './rooms';

// The shopping list (M3, OD-50; Linear *Data model* doc → M3). One line per thing to buy, in a
// phase, for a room or the whole house. Status: To buy → Purchased (what was paid) → Returned
// (what came back). A line can say which job it's for; that job must be in the same phase.

const live = () => isNull(shoppingLines.deletedAt);

/** To buy first, then Purchased, then Returned. */
const STATUS_ORDER = sql`case ${shoppingLines.status} when 'to_buy' then 0 when 'purchased' then 1 else 2 end`;

/** Live lines in live phases, with phase, room, category and job names, To buy first. */
export async function listShoppingLines(db: Db, filter: ShoppingLineList & { id?: string } = {}) {
  const conds = [live(), isNull(phases.deletedAt)];
  if (filter.id !== undefined) conds.push(eq(shoppingLines.id, filter.id));
  if (filter.phaseId !== undefined) conds.push(eq(shoppingLines.phaseId, filter.phaseId));
  if (filter.roomId === null) conds.push(isNull(shoppingLines.roomId));
  else if (filter.roomId !== undefined) conds.push(eq(shoppingLines.roomId, filter.roomId));
  if (filter.categoryId !== undefined) conds.push(eq(shoppingLines.categoryId, filter.categoryId));
  if (filter.jobId !== undefined) conds.push(eq(shoppingLines.jobId, filter.jobId));
  if (filter.status !== undefined) conds.push(eq(shoppingLines.status, filter.status));

  const rows = await db
    .select({
      line: shoppingLines,
      phase: { id: phases.id, name: phases.name, status: phases.status },
      category: { id: categories.id, name: categories.name },
      room: { id: rooms.id, name: rooms.name },
      job: { id: jobs.id, name: jobs.name },
    })
    .from(shoppingLines)
    .innerJoin(phases, eq(phases.id, shoppingLines.phaseId))
    .innerJoin(categories, eq(categories.id, shoppingLines.categoryId))
    .leftJoin(rooms, eq(rooms.id, shoppingLines.roomId))
    .leftJoin(jobs, eq(jobs.id, shoppingLines.jobId))
    .where(and(...conds))
    .orderBy(
      STATUS_ORDER,
      asc(phases.sortOrder),
      sql`${rooms.sortOrder} asc nulls last`,
      sql`${rooms.name} asc nulls last`,
      asc(shoppingLines.sortOrder),
      asc(shoppingLines.name),
    );
  return rows.map(({ line, phase, category, room, job }) => ({
    ...line,
    phase,
    category,
    room: room?.id ? room : null,
    job: job?.id ? job : null,
  }));
}

export async function getShoppingLine(db: Db, id: string) {
  const [row] = await listShoppingLines(db, { id });
  if (!row) throw notFound('Shopping line');
  return row;
}

/** The phase, category, room and job a line points at all exist; the job is in its phase. */
async function checkRefs(
  db: Db,
  refs: Pick<ShoppingLine, 'phaseId' | 'categoryId' | 'roomId' | 'jobId'>,
) {
  const phase = await getPhase(db, refs.phaseId);
  await getCategory(db, refs.categoryId);
  if (refs.roomId !== null) await getRoom(db, refs.roomId);
  if (refs.jobId !== null) {
    const [job] = await db
      .select({ phaseId: jobs.phaseId, name: jobs.name })
      .from(jobs)
      .where(and(eq(jobs.id, refs.jobId), isNull(jobs.deletedAt)));
    if (!job) throw notFound('Job');
    if (job.phaseId !== phase.id) {
      throw badRequest(`"${job.name}" is in another phase; put this line in the same phase`);
    }
  }
}

export async function createShoppingLine(db: Db, input: ShoppingLineCreate) {
  await checkRefs(db, input);
  const [row] = await db.insert(shoppingLines).values(input).returning();
  if (!row) throw new Error('insert returned no row');
  return getShoppingLine(db, row.id);
}

/**
 * Edits and status changes. Purchased keeps what was paid; Returned needs what came back, no
 * more than was paid, and only after it was bought; back to To buy clears both amounts.
 */
export async function updateShoppingLine(
  db: Db,
  { id, status, paidCents, refundCents, ...patch }: ShoppingLineUpdate,
) {
  const current = await getShoppingLine(db, id);
  const next = {
    phaseId: patch.phaseId ?? current.phaseId,
    categoryId: patch.categoryId ?? current.categoryId,
    roomId: patch.roomId === undefined ? current.roomId : patch.roomId,
    jobId: patch.jobId === undefined ? current.jobId : patch.jobId,
  };
  await checkRefs(db, next);

  const target = status ?? current.status;
  let amounts: Pick<ShoppingLine, 'paidCents' | 'refundCents'>;
  if (target === 'to_buy') {
    amounts = { paidCents: null, refundCents: null };
  } else if (target === 'purchased') {
    const paid = paidCents ?? current.paidCents;
    if (paid === null) throw badRequest('Say what was paid');
    amounts = { paidCents: paid, refundCents: null };
  } else {
    const paid = paidCents ?? current.paidCents;
    if (paid === null) throw badRequest('Mark it as purchased first, with what was paid');
    const refund = refundCents ?? current.refundCents;
    if (refund === null) throw badRequest('Say how much came back');
    if (refund > paid) throw badRequest('More came back than was paid; check the amounts');
    amounts = { paidCents: paid, refundCents: refund };
  }

  await db
    .update(shoppingLines)
    .set({ ...patch, ...next, status: target, ...amounts })
    .where(and(eq(shoppingLines.id, id), live()));
  return getShoppingLine(db, id);
}

export async function removeShoppingLine(db: Db, id: string) {
  await getShoppingLine(db, id);
  await db.update(shoppingLines).set({ deletedAt: new Date() }).where(eq(shoppingLines.id, id));
  return { id };
}

export async function restoreShoppingLine(db: Db, id: string) {
  const [row] = await db.select().from(shoppingLines).where(eq(shoppingLines.id, id));
  if (!row) throw notFound('Shopping line');
  if (row.deletedAt !== null) {
    await db.update(shoppingLines).set({ deletedAt: null }).where(eq(shoppingLines.id, id));
  }
  return getShoppingLine(db, id);
}
