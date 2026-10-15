import {
  and,
  budget,
  categories,
  costLines,
  eq,
  isNull,
  jobs,
  payments,
  phases,
  rooms,
  shoppingLines,
  sql,
  vendors,
  type Db,
} from '@reparo/db';
import { importLineSchema, isIsoDate, type ImportLine } from '@reparo/shared';
import { updateBudget } from '../services/budget';
import { createCostLine } from '../services/job-money';
import { createJob, updateJob } from '../services/jobs';
import { getMoneySummary } from '../services/money';
import { createRoom } from '../services/rooms';
import { createShoppingLine } from '../services/shopping-lines';
import { createVendor } from '../services/vendors';

// The spreadsheet import (OD-36; grilling 2026-10-14 Q29–Q30 and 2026-10-15 Q1–Q17). It loads
// the reviewed lines file into the database through the same services the app uses, so every
// rule (phases, categories, a line's job in its phase) is checked the same way. The caller runs
// it inside a transaction: a dry run rolls back, `--write` commits.

export class ImportProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportProblem';
  }
}

/** Check every row before anything is written; report all problems at once, by line id. */
export function validateLines(records: Record<string, string>[]): ImportLine[] {
  const problems: string[] = [];
  const lines: ImportLine[] = [];
  records.forEach((rec, i) => {
    const parsed = importLineSchema.safeParse(rec);
    if (parsed.success) {
      lines.push(parsed.data);
    } else {
      const where = rec['id'] || `row ${i + 2}`;
      for (const issue of parsed.error.issues) {
        problems.push(`${where} ${issue.path.join('.')}: ${issue.message}`);
      }
    }
  });
  if (problems.length > 0)
    throw new ImportProblem(`The lines file has problems:\n${problems.join('\n')}`);
  return lines;
}

/** Names match ignoring case, surrounding spaces and curly apostrophes. */
const key = (name: string) => name.trim().toLowerCase().replace(/’/g, "'");

/** Refuse to run on a database that already has money in it, so nothing counts twice (Q13). */
async function assertNoMoneyYet(db: Db) {
  const [counts] = await db
    .select({
      lines:
        sql<number>`(select count(*) from ${shoppingLines} where ${shoppingLines.deletedAt} is null)`.mapWith(
          Number,
        ),
      costs:
        sql<number>`(select count(*) from ${costLines} where ${costLines.deletedAt} is null)`.mapWith(
          Number,
        ),
      paid: sql<number>`(select count(*) from ${payments} where ${payments.deletedAt} is null)`.mapWith(
        Number,
      ),
      pool: sql<number>`(select coalesce(max(${budget.startingCents}), 0) from ${budget})`.mapWith(
        Number,
      ),
    })
    .from(sql`(select 1) as one`);
  if (!counts) return;
  const found = [
    counts.lines > 0 ? `${counts.lines} shopping line(s)` : null,
    counts.costs > 0 ? `${counts.costs} cost line(s)` : null,
    counts.paid > 0 ? `${counts.paid} payment(s)` : null,
    counts.pool !== 0 ? 'a starting balance' : null,
  ].filter((f): f is string => f !== null);
  if (found.length > 0) {
    const list =
      found.length === 1 ? found[0] : `${found.slice(0, -1).join(', ')} and ${found.at(-1)}`;
    throw new ImportProblem(
      `This database already has ${list}, so importing would count money twice. ` +
        'The import is for a database with no money in it yet.',
    );
  }
}

export type ImportReport = Awaited<ReturnType<typeof runImport>>;

export async function runImport(db: Db, all: ImportLine[]) {
  await assertNoMoneyYet(db);
  const lines = all.filter((l) => l.action === 'import');
  const made = { vendors: 0, rooms: 0, jobs: 0, costLines: 0, shoppingLines: 0 };

  // Look-ups by name, filled from the database and as rows are created.
  const phaseRows = await db.select().from(phases).where(isNull(phases.deletedAt));
  const phaseByName = new Map(phaseRows.map((p) => [key(p.name), p]));
  const roomRows = await db.select().from(rooms).where(isNull(rooms.deletedAt));
  const roomByName = new Map(roomRows.map((r) => [key(r.name), r.id]));
  const catRows = await db.select().from(categories).where(isNull(categories.deletedAt));
  const catByName = new Map(catRows.map((c) => [key(c.name), c.id]));
  const vendorRows = await db.select().from(vendors).where(isNull(vendors.deletedAt));
  const vendorByName = new Map(vendorRows.map((v) => [key(v.name), v.id]));

  const phaseId = (name: string, id: string) => {
    const p = phaseByName.get(key(name));
    if (!p) throw new ImportProblem(`${id}: there's no phase called "${name}"; add it first`);
    return p.id;
  };
  const categoryId = (name: string, id: string) => {
    const c = catByName.get(key(name));
    if (!c) throw new ImportProblem(`${id}: there's no category called "${name}"`);
    return c;
  };
  async function roomId(name: string) {
    if (name === '') return null;
    const found = roomByName.get(key(name));
    if (found) return found;
    const room = await createRoom(db, {
      name,
      sortOrder: 0,
      lengthIn: null,
      widthIn: null,
      ceilingHeightIn: null,
      notes: '',
    });
    made.rooms += 1;
    roomByName.set(key(name), room.id);
    return room.id;
  }
  async function vendorId(name: string, trade = '') {
    if (name === '') return null;
    const found = vendorByName.get(key(name));
    if (found) return found;
    const v = await createVendor(db, { name, trade, phone: '', email: '', notes: '' });
    made.vendors += 1;
    vendorByName.set(key(name), v.id);
    return v.id;
  }
  /** The live job in this phase with one of the given names, or a new one (Q1). */
  const jobCache = new Map<string, string>();
  async function jobId(line: ImportLine, phase: string) {
    const names = [line.job, ...line.job_match.split(';')].map((n) => n.trim()).filter(Boolean);
    const cacheKey = `${phase}|${key(line.job)}`;
    const cached = jobCache.get(cacheKey);
    if (cached) return cached;
    const existing = await db
      .select({ id: jobs.id, name: jobs.name, vendorId: jobs.vendorId })
      .from(jobs)
      .where(and(eq(jobs.phaseId, phase), isNull(jobs.deletedAt)));
    const wanted = names.map(key);
    const match = wanted.map((w) => existing.find((j) => key(j.name) === w)).find(Boolean);
    const vendor = await vendorId(line.vendor);
    let id: string;
    if (match) {
      id = match.id;
      if (vendor && !match.vendorId) await updateJob(db, { id, vendorId: vendor });
    } else {
      const job = await createJob(db, {
        phaseId: phase,
        name: line.job,
        vendorId: vendor,
        roomIds: [],
        spec: '',
        notes: '',
        status: 'unstarted',
        sortOrder: 0,
      });
      made.jobs += 1;
      id = job.id;
    }
    jobCache.set(cacheKey, id);
    return id;
  }

  for (const line of lines.filter((l) => l.kind === 'budget')) {
    await updateBudget(db, {
      startingCents: line.amount,
      asOf: isIsoDate(line.notes) ? line.notes : null,
    });
  }
  for (const line of lines.filter((l) => l.kind === 'vendor')) {
    await vendorId(line.name, line.trade);
  }
  for (const line of lines.filter((l) => l.kind === 'job_cost')) {
    const job = await jobId(line, phaseId(line.phase, line.id));
    await createCostLine(db, {
      jobId: job,
      description: line.name,
      amountCents: line.amount,
      notes: line.notes,
    });
    made.costLines += 1;
  }
  for (const line of lines.filter((l) => l.kind === 'shopping')) {
    const phase = phaseId(line.phase, line.id);
    await createShoppingLine(db, {
      phaseId: phase,
      roomId: await roomId(line.room),
      categoryId: categoryId(line.category, line.id),
      jobId: line.job === '' ? null : await jobId(line, phase),
      name: line.name,
      link: line.link,
      store: line.store,
      modelNumber: line.model_number,
      quantity: line.quantity,
      priceCents: line.amount,
      notes: line.notes,
    });
    made.shoppingLines += 1;
  }

  const money = await getMoneySummary(db);
  return { made, skipped: all.length - lines.length, money };
}
