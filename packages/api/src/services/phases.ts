import { and, asc, eq, isNull, phases, type Db } from '@reparo/db';
import type { PhaseCreate, PhaseUpdate } from '@reparo/shared';
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
    const [row] = await db.insert(phases).values(input).returning();
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

/** Soft-delete. Work items in the phase keep their phase_id; they're hidden with it. */
export async function removePhase(db: Db, id: string) {
  await getPhase(db, id);
  await db.update(phases).set({ deletedAt: new Date() }).where(eq(phases.id, id));
  return { id };
}
