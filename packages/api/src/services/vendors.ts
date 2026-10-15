import {
  and,
  asc,
  count,
  eq,
  ilike,
  isNull,
  jobs,
  or,
  sql,
  vendors,
  type Db,
  type Vendor,
} from '@reparo/db';
import type { VendorCreate, VendorList, VendorUpdate } from '@reparo/shared';
import { conflict, isUniqueViolation, notFound } from './errors';

// Vendors: people we hire (M2, OD-45; Linear *Data model* doc → M2). Archiving is the soft
// delete — an archived vendor is hidden from the list and the picker, but a job that names it
// still shows it (see `vendorSummary`). Editors add and edit; only the admin archives.

const live = () => isNull(vendors.deletedAt);

/** How a job shows its vendor: enough to call or email from the job page. */
export function vendorSummary(v: Vendor) {
  return {
    id: v.id,
    name: v.name,
    trade: v.trade,
    phone: v.phone,
    email: v.email,
    archived: v.deletedAt !== null,
  };
}

const NAME_TAKEN = 'vendors_name_live_uidx';
const taken = (name: string) => conflict(`There's already a vendor called ${name}`);

/** Live vendors by name, each with how many live jobs name it. `query` matches name or trade. */
export async function listVendors(db: Db, { query, includeArchived }: VendorList) {
  const conds = [];
  if (!includeArchived) conds.push(live());
  if (query !== '') {
    const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(vendors.name, like), ilike(vendors.trade, like)));
  }
  const rows = await db
    .select({ vendor: vendors, jobCount: count(jobs.id) })
    .from(vendors)
    .leftJoin(jobs, and(eq(jobs.vendorId, vendors.id), isNull(jobs.deletedAt)))
    .where(and(...conds))
    .groupBy(vendors.id)
    .orderBy(asc(sql`lower(${vendors.name})`));
  return rows.map(({ vendor, jobCount }) => ({
    ...vendor,
    archived: vendor.deletedAt !== null,
    jobCount,
  }));
}

/** A live vendor. Archived ones are NOT_FOUND here, like every soft-deleted row (api.md). */
export async function getVendor(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, id), live()));
  if (!row) throw notFound('Vendor');
  return row;
}

export async function createVendor(db: Db, input: VendorCreate) {
  try {
    const [row] = await db.insert(vendors).values(input).returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  } catch (e) {
    if (isUniqueViolation(e, NAME_TAKEN)) throw taken(input.name);
    throw e;
  }
}

export async function updateVendor(db: Db, { id, ...patch }: VendorUpdate) {
  await getVendor(db, id);
  try {
    const [row] = await db
      .update(vendors)
      .set(patch)
      .where(and(eq(vendors.id, id), live()))
      .returning();
    if (!row) throw notFound('Vendor');
    return row;
  } catch (e) {
    if (isUniqueViolation(e, NAME_TAKEN)) throw taken(patch.name ?? 'that');
    throw e;
  }
}

/** Archive (admin). Jobs keep pointing at the vendor and still show its name. */
export async function archiveVendor(db: Db, id: string) {
  await getVendor(db, id);
  await db.update(vendors).set({ deletedAt: new Date() }).where(eq(vendors.id, id));
  return { id };
}

/** Bring an archived vendor back (admin). Refused if a live vendor now has the name. */
export async function restoreVendor(db: Db, id: string) {
  const [row] = await db.select().from(vendors).where(eq(vendors.id, id));
  if (!row) throw notFound('Vendor');
  if (row.deletedAt === null) return row;
  try {
    const [back] = await db
      .update(vendors)
      .set({ deletedAt: null })
      .where(eq(vendors.id, id))
      .returning();
    if (!back) throw notFound('Vendor');
    return back;
  } catch (e) {
    if (isUniqueViolation(e, NAME_TAKEN)) throw taken(row.name);
    throw e;
  }
}
