import { and, costLines, eq, estimates, isNull, jobs, phases, vendors, type Db } from '@reparo/db';
import type { ImportLine } from '@reparo/shared';

// The four imported vendor prices become chosen estimates (M4, OD-62; Q29): TJ on Demo,
// Pro-vision on Paint, Brian on the project fee, Rolland Reash on Plumbing. Each is tied to the
// cost line the import made, so the money doesn't change and choosing another estimate later
// swaps the line cleanly. Read from the same lines file as the import: the `job_cost` rows
// that name a vendor.

const key = (name: string) => name.trim().toLowerCase().replace(/’/g, "'");

export type QuoteReport = { made: string[]; skipped: string[] };

export async function adoptImportedQuotes(db: Db, lines: ImportLine[]): Promise<QuoteReport> {
  const report: QuoteReport = { made: [], skipped: [] };
  const priced = lines.filter((l) => l.action === 'import' && l.kind === 'job_cost' && l.vendor);
  for (const line of priced) {
    const where = `${line.id} (${line.job}, ${line.vendor})`;
    const names = [line.job, ...line.job_match.split(';')].map(key).filter(Boolean);
    const candidates = await db
      .select({ id: jobs.id, name: jobs.name, vendorId: jobs.vendorId })
      .from(jobs)
      .innerJoin(phases, eq(phases.id, jobs.phaseId))
      .where(and(isNull(jobs.deletedAt), isNull(phases.deletedAt), eq(phases.name, line.phase)));
    const job = names.map((n) => candidates.find((j) => key(j.name) === n)).find(Boolean);
    if (!job) {
      report.skipped.push(`${where}: no live job by that name in ${line.phase}`);
      continue;
    }
    const existing = await db
      .select({ id: estimates.id })
      .from(estimates)
      .where(and(eq(estimates.jobId, job.id), isNull(estimates.deletedAt)));
    if (existing.length > 0) {
      report.skipped.push(`${where}: ${job.name} already has estimates`);
      continue;
    }
    const jobLines = await db
      .select()
      .from(costLines)
      .where(and(eq(costLines.jobId, job.id), isNull(costLines.deletedAt)));
    const named = jobLines.filter((c) => key(c.description) === key(line.name));
    const cost = named.find((c) => c.amountCents === line.amount) ?? named[0];
    if (!cost) {
      report.skipped.push(`${where}: ${job.name} has no cost line "${line.name}"`);
      continue;
    }
    // The job's vendor if it has one (it may have been changed since), else the named one.
    let vendorId = job.vendorId;
    if (!vendorId) {
      const all = await db
        .select({ id: vendors.id, name: vendors.name })
        .from(vendors)
        .where(isNull(vendors.deletedAt));
      vendorId = all.find((v) => key(v.name) === key(line.vendor))?.id ?? null;
    }
    if (!vendorId) {
      report.skipped.push(`${where}: no vendor called ${line.vendor}`);
      continue;
    }
    await db.insert(estimates).values({
      jobId: job.id,
      vendorId,
      amountCents: cost.amountCents,
      status: 'chosen',
      costLineId: cost.id,
      notes: 'From the budget spreadsheet.',
      sortOrder: 10,
    });
    if (!job.vendorId) await db.update(jobs).set({ vendorId }).where(eq(jobs.id, job.id));
    report.made.push(`${job.name}: ${cost.description}`);
  }
  return report;
}
