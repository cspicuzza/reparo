import { and, asc, eq, estimates, inArray, isNull, jobs, type Db } from '@reparo/db';
import { listJobs } from './jobs';
import { getVendor } from './vendors';

/**
 * What a vendor is doing for us, for their panel (OD-124, Q158): each of their jobs with its
 * status, the chosen quote and what's been paid, and the estimates from them still open
 * (asked for or received, not yet chosen or declined) on any job. Kept out of the vendors
 * service because jobs already depends on it.
 */
export async function vendorWork(db: Db, vendorId: string) {
  await getVendor(db, vendorId);
  const theirJobs = await listJobs(db, { vendorId });
  const ids = theirJobs.map((j) => j.id);
  const chosen =
    ids.length === 0
      ? []
      : await db
          .select({ jobId: estimates.jobId, amountCents: estimates.amountCents })
          .from(estimates)
          .where(
            and(
              inArray(estimates.jobId, ids),
              eq(estimates.vendorId, vendorId),
              eq(estimates.status, 'chosen'),
              isNull(estimates.deletedAt),
            ),
          );
  const quote = new Map(chosen.map((c) => [c.jobId, c.amountCents]));
  const open = await db
    .select({
      id: estimates.id,
      jobId: estimates.jobId,
      jobName: jobs.name,
      status: estimates.status,
      amountCents: estimates.amountCents,
      validUntil: estimates.validUntil,
    })
    .from(estimates)
    .innerJoin(jobs, eq(jobs.id, estimates.jobId))
    .where(
      and(
        eq(estimates.vendorId, vendorId),
        inArray(estimates.status, ['requested', 'received']),
        isNull(estimates.deletedAt),
        isNull(jobs.deletedAt),
      ),
    )
    .orderBy(asc(jobs.name), asc(estimates.createdAt));
  return {
    jobs: theirJobs.map((j) => ({
      id: j.id,
      name: j.name,
      phase: { id: j.phase.id, name: j.phase.name },
      status: j.progress.status,
      quoteCents: quote.get(j.id) ?? null,
      paidCents: j.money.paidCents,
    })),
    openEstimates: open,
  };
}
