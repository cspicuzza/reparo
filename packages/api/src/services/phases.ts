import { and, asc, eq, isNull, phases, sql, type Db } from '@reparo/db';
import type { Move, PhaseCreate, PhaseUpdate } from '@reparo/shared';
import { moved } from './order';
import { conflict, isUniqueViolation, notFound } from './errors';

const live = () => isNull(phases.deletedAt);

export function listPhases(db: Db) {
  return db.select().from(phases).where(live()).orderBy(asc(phases.sortOrder), asc(phases.name));
}

export async function getPhase(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.id, id), live()));
  if (!row) throw notFound('Phase');
  return row;
}

export async function createPhase(db: Db, input: PhaseCreate) {
  try {
    // A new phase goes after the last one unless it says otherwise (OD-117, Q141).
    const sortOrder = input.sortOrder ?? (await nextPhaseOrder(db));
    const [row] = await db
      .insert(phases)
      .values({ ...input, sortOrder })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  } catch (e) {
    if (isUniqueViolation(e, 'phases_name_live_uidx')) {
      throw conflict(`A phase named "${input.name}" already exists`);
    }
    throw e;
  }
}

export async function updatePhase(db: Db, { id, ...patch }: PhaseUpdate) {
  await getPhase(db, id);
  try {
    const [row] = await db
      .update(phases)
      .set(patch)
      .where(and(eq(phases.id, id), live()))
      .returning();
    if (!row) throw notFound('Phase');
    return row;
  } catch (e) {
    if (isUniqueViolation(e, 'phases_name_live_uidx')) {
      throw conflict(`A phase named "${patch.name ?? ''}" already exists`);
    }
    throw e;
  }
}

/** Soft-delete. Jobs in the phase keep their phase_id; they're hidden with it. */
export async function removePhase(db: Db, id: string) {
  await getPhase(db, id);
  await db.update(phases).set({ deletedAt: new Date() }).where(eq(phases.id, id));
  return { id };
}

async function nextPhaseOrder(db: Db): Promise<number> {
  const [r] = await db
    .select({ max: sql<number | null>`max(${phases.sortOrder})` })
    .from(phases)
    .where(live());
  return r?.max == null ? 0 : Number(r.max) + 1;
}

/** Move a phase up or down the list (OD-117, Q141): the list is renumbered in its new order. */
export async function movePhase(db: Db, { id, by }: Move) {
  await getPhase(db, id);
  return db.transaction(async (tx) => {
    const order = moved(await listPhases(tx), id, by);
    for (const [i, p] of order.entries()) {
      if (p.sortOrder !== i)
        await tx.update(phases).set({ sortOrder: i }).where(eq(phases.id, p.id));
    }
    return order.map((p, i) => ({ id: p.id, sortOrder: i }));
  });
}
