import { useQueryClient, type QueryFilters } from '@tanstack/react-query';
import { useTRPC } from './trpc';

/**
 * One refresh list per kind of thing (OD-115, Q137): every save of a job, phase, money entry or
 * shopping line refreshes the same queries wherever it's made, so no screen shows an old number
 * because one save forgot a list. Each list is everything that kind of change can move.
 */
function useRefresh(pick: (trpc: ReturnType<typeof useTRPC>) => QueryFilters[]) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(pick(trpc).map((f) => queryClient.invalidateQueries(f)));
  };
}

/**
 * A job, its rooms, status, vendor or spec: job lists and pages, room progress, phase progress,
 * vendors' job counts, the money (a job's price counts toward Planned), and the shopping lines
 * and estimates that show the job's name (OD-145).
 */
export function useRefreshJobs() {
  return useRefresh((t) => [
    t.jobs.pathFilter(),
    t.jobRooms.pathFilter(),
    t.rooms.pathFilter(),
    t.phases.pathFilter(),
    t.vendors.pathFilter(),
    t.money.pathFilter(),
    t.home.pathFilter(),
    t.shoppingLines.pathFilter(),
    t.estimates.pathFilter(),
  ]);
}

/**
 * A room added, renamed, measured, reordered or removed (OD-145): the rooms, Home's list, the
 * shopping lines and jobs that name it, and the money split by room.
 */
export function useRefreshRooms() {
  return useRefresh((t) => [
    t.rooms.pathFilter(),
    t.jobRooms.pathFilter(),
    t.jobs.pathFilter(),
    t.shoppingLines.pathFilter(),
    t.money.pathFilter(),
    t.home.pathFilter(),
  ]);
}

/**
 * A vendor added, edited or archived (OD-145): the vendors, and the jobs, estimates and payments
 * that show its name.
 */
export function useRefreshVendors() {
  return useRefresh((t) => [
    t.vendors.pathFilter(),
    t.jobs.pathFilter(),
    t.estimates.pathFilter(),
    t.payments.pathFilter(),
    t.home.pathFilter(),
  ]);
}

/** Pictures and files (OD-145): every file list, the room covers among them. */
export function useRefreshFiles() {
  return useRefresh((t) => [t.files.pathFilter()]);
}

/** A phase: its name and status move jobs, shopping lines, rooms' progress and the money. */
export function useRefreshPhases() {
  return useRefresh((t) => [
    t.phases.pathFilter(),
    t.jobs.pathFilter(),
    t.rooms.pathFilter(),
    t.shoppingLines.pathFilter(),
    t.money.pathFilter(),
    t.home.pathFilter(),
  ]);
}

/**
 * Money: the budget, adjustments, a job's costs, payments and estimates. These move the money
 * summaries, a job's own totals and phases' money.
 */
export function useRefreshMoney() {
  return useRefresh((t) => [
    t.budget.pathFilter(),
    t.budgetAdjustments.pathFilter(),
    t.costLines.pathFilter(),
    t.payments.pathFilter(),
    t.estimates.pathFilter(),
    t.jobs.pathFilter(),
    t.phases.pathFilter(),
    t.vendors.pathFilter(),
    t.money.pathFilter(),
    t.home.pathFilter(),
  ]);
}

/**
 * Shopping lines (buying, returning, editing, moving, removing) and categories: the list, its
 * totals, rooms (what's on them), categories' counts, the money and each phase's money.
 */
export function useRefreshShopping() {
  return useRefresh((t) => [
    t.shoppingLines.pathFilter(),
    t.categories.pathFilter(),
    t.rooms.pathFilter(),
    t.money.pathFilter(),
    t.home.pathFilter(),
    // Each phase carries its money now (OD-123).
    t.phases.pathFilter(),
  ]);
}
