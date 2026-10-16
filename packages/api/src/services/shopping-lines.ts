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
import {
  sumCents,
  type Cents,
  type ShoppingLineCreate,
  type ShoppingLineList,
  type ShoppingLineUpdate,
  type ShoppingLineUpdateMany,
  type StoreRename,
} from '@reparo/shared';
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
  if (filter.store !== undefined) {
    conds.push(sql`lower(trim(${shoppingLines.store})) = ${filter.store.toLowerCase()}`);
  }
  if (filter.q !== undefined) {
    // Search (OD-98): the text anywhere in the name, store, model number or notes, any case.
    // `%`, `_` and `\` are escaped so they match themselves (Postgres LIKE's default escape is
    // backslash: https://www.postgresql.org/docs/16/functions-matching.html#FUNCTIONS-LIKE).
    const pattern = `%${filter.q.replace(/[\\%_]/g, '\\$&')}%`;
    conds.push(
      sql`(${shoppingLines.name} ilike ${pattern} or ${shoppingLines.store} ilike ${pattern} or ${shoppingLines.modelNumber} ilike ${pattern} or ${shoppingLines.notes} ilike ${pattern})`,
    );
  }

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
  const store = await snapStore(db, input.store);
  const [row] = await db
    .insert(shoppingLines)
    .values({ ...input, store })
    .returning();
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

  const store = patch.store === undefined ? undefined : await snapStore(db, patch.store, id);
  await db
    .update(shoppingLines)
    .set({
      ...patch,
      ...(store === undefined ? {} : { store }),
      ...next,
      status: target,
      ...amounts,
    })
    .where(and(eq(shoppingLines.id, id), live()));
  return getShoppingLine(db, id);
}

/**
 * Batch edits (OD-101): each change goes through the same rules as one edit (a job must be in
 * the line's phase, and so on), all in one transaction, so a batch happens completely or not
 * at all.
 */
export async function updateManyShoppingLines(db: Db, { changes }: ShoppingLineUpdateMany) {
  await db.transaction(async (tx) => {
    for (const change of changes) await updateShoppingLine(tx, change);
  });
  return { count: changes.length };
}

/** Remove several lines together, in one transaction (OD-101). Restorable, like one removal. */
export async function removeManyShoppingLines(db: Db, ids: string[]) {
  await db.transaction(async (tx) => {
    for (const id of ids) await removeShoppingLine(tx, id);
  });
  return { count: ids.length };
}

/** Bring back several removed lines together: Undo after a batch removal (OD-101). */
export async function restoreManyShoppingLines(db: Db, ids: string[]) {
  await db.transaction(async (tx) => {
    for (const id of ids) await restoreShoppingLine(tx, id);
  });
  return { count: ids.length };
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

// --- totals (Workflow polish, OD-68) ----------------------------------------------------------

type Status = 'to_buy' | 'purchased' | 'returned';

/**
 * What a line counts for in its section: the price while it's To buy, what was paid once
 * Purchased, and what was paid less what came back once Returned.
 */
export function lineSectionCents(l: {
  status: Status;
  priceCents: Cents;
  paidCents: Cents | null;
  refundCents: Cents | null;
}): Cents {
  if (l.status === 'to_buy') return l.priceCents;
  if (l.status === 'purchased') return l.paidCents ?? 0;
  return sumCents([l.paidCents ?? 0, -(l.refundCents ?? 0)]);
}

/**
 * Counts and totals for the Shopping page, following the same filters as the list: one
 * section per status (To buy, Purchased, Returned, always all three), and inside each the rooms
 * that have lines, in room order, with Whole house (roomId null) last.
 */
export async function shoppingTotals(db: Db, filter: ShoppingLineList = {}) {
  const lines = await listShoppingLines(db, filter);
  const roomOrder = await db
    .select({ id: rooms.id, sortOrder: rooms.sortOrder, name: rooms.name })
    .from(rooms);
  const rank = new Map(
    roomOrder
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((r, i) => [r.id, i]),
  );
  const statuses: Status[] = ['to_buy', 'purchased', 'returned'];
  return statuses.map((status) => {
    const inSection = lines.filter((l) => l.status === status);
    const byRoom = new Map<string | null, typeof inSection>();
    for (const l of inSection) {
      const key = l.room?.id ?? null;
      byRoom.set(key, [...(byRoom.get(key) ?? []), l]);
    }
    const roomsInSection = [...byRoom.entries()]
      .map(([roomId, ls]) => ({
        roomId,
        name: ls[0]?.room?.name ?? 'Whole house',
        count: ls.length,
        totalCents: sumCents(ls.map(lineSectionCents)),
      }))
      .sort((a, b) => {
        if (a.roomId === null) return 1;
        if (b.roomId === null) return -1;
        return (rank.get(a.roomId) ?? 0) - (rank.get(b.roomId) ?? 0);
      });
    return {
      status,
      count: inSection.length,
      totalCents: sumCents(inSection.map(lineSectionCents)),
      rooms: roomsInSection,
    };
  });
}

// --- stores (Workflow polish, OD-69) ----------------------------------------------------------

/**
 * The stores in use on live lines, one entry per store whatever the case, spelled the way most
 * lines spell it, most used first. For suggestions as you type.
 */
export async function listStores(db: Db) {
  const counts = await db
    .select({ store: shoppingLines.store, n: sql<number>`count(*)::int` })
    .from(shoppingLines)
    .where(and(live(), sql`trim(${shoppingLines.store}) <> ''`))
    .groupBy(shoppingLines.store);
  const byKey = new Map<string, { name: string; count: number; best: number }>();
  for (const { store, n } of counts) {
    const key = store.trim().toLowerCase();
    const seen = byKey.get(key);
    if (!seen) byKey.set(key, { name: store.trim(), count: n, best: n });
    else {
      seen.count += n;
      if (n > seen.best) {
        seen.best = n;
        seen.name = store.trim();
      }
    }
  }
  return [...byKey.values()]
    .map(({ name, count }) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * A store as typed, snapped to the spelling already in use when only the case differs
 * ("wayfair" → "Wayfair"), so the list doesn't grow two of the same store. `exceptLineId` leaves
 * the line being edited out of the count.
 */
async function snapStore(db: Db, typed: string, exceptLineId?: string): Promise<string> {
  const trimmed = typed.trim();
  if (trimmed === '') return '';
  const conds = [live(), sql`lower(trim(${shoppingLines.store})) = ${trimmed.toLowerCase()}`];
  if (exceptLineId !== undefined) conds.push(sql`${shoppingLines.id} <> ${exceptLineId}`);
  const [existing] = await db
    .select({ store: shoppingLines.store, n: sql<number>`count(*)::int` })
    .from(shoppingLines)
    .where(and(...conds))
    .groupBy(shoppingLines.store)
    .orderBy(sql`count(*) desc`, asc(shoppingLines.store))
    .limit(1);
  return existing ? existing.store.trim() : trimmed;
}

/** "Rename this store everywhere": every live line whose store matches `from`, any case. */
export async function renameStore(db: Db, { from, to }: StoreRename) {
  const changed = await db
    .update(shoppingLines)
    .set({ store: to })
    .where(and(live(), sql`lower(trim(${shoppingLines.store})) = ${from.toLowerCase()}`))
    .returning({ id: shoppingLines.id });
  if (changed.length === 0) throw notFound('Store');
  return { name: to, count: changed.length };
}
