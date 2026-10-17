import { shoppingFilter, withoutStore, type ShoppingSearch } from './shopping';
import { queryClient, trpcOptions as t } from './trpc';

/**
 * Start a page's data the moment its route opens, or when a link to it is hovered (the router
 * preloads on intent), instead of each section asking only once the one above it has drawn
 * (OD-115, Q137). Everything runs at once; lists that need ids from another list (the pictures
 * of a room's lines) start as soon as that list arrives. Nothing here waits or throws: each
 * section still shows its own loading and error from the same queries.
 */
const ensure = <T>(p: Promise<T>) => p.catch(() => undefined);

export function prefetchRoom(roomId: string): void {
  void ensure(queryClient.ensureQueryData(t.rooms.get.queryOptions({ id: roomId })));
  void ensure(
    queryClient.ensureQueryData(t.files.list.queryOptions({ ownerType: 'room', ownerId: roomId })),
  );
  void ensure(queryClient.ensureQueryData(t.jobs.forRoom.queryOptions({ roomId })));
  void ensure(
    queryClient.ensureQueryData(t.shoppingLines.list.queryOptions({ roomId })).then((lines) =>
      lines.length > 0
        ? queryClient.ensureQueryData(
            t.files.listMany.queryOptions({
              ownerType: 'shopping_line',
              ownerIds: lines.map((l) => l.id),
            }),
          )
        : undefined,
    ),
  );
}

export function prefetchJob(jobId: string): void {
  void ensure(queryClient.ensureQueryData(t.jobs.get.queryOptions({ id: jobId })));
  void ensure(
    queryClient.ensureQueryData(t.estimates.list.queryOptions({ jobId })).then((list) =>
      list.length > 0
        ? queryClient.ensureQueryData(
            t.files.listMany.queryOptions({
              ownerType: 'estimate',
              ownerIds: list.map((e) => e.id),
            }),
          )
        : undefined,
    ),
  );
  void ensure(queryClient.ensureQueryData(t.costLines.list.queryOptions({ jobId })));
  void ensure(
    queryClient.ensureQueryData(t.payments.list.queryOptions({ jobId })).then((list) =>
      // No payments, no receipts to ask for, as the other lists here (OD-155).
      list.length > 0
        ? queryClient.ensureQueryData(
            t.files.listMany.queryOptions({
              ownerType: 'payment',
              ownerIds: list.map((p) => p.id),
            }),
          )
        : undefined,
    ),
  );
  void ensure(queryClient.ensureQueryData(t.shoppingLines.list.queryOptions({ jobId })));
  void ensure(
    queryClient.ensureQueryData(t.files.list.queryOptions({ ownerType: 'job', ownerId: jobId })),
  );
  void ensure(queryClient.ensureQueryData(t.files.forJob.queryOptions({ jobId })));
}

// The list pages (OD-154): each starts the queries its screen reads first, with the same input,
// so hovering a link fetches the data as well as the code. Fire and forget, as above.
// https://tanstack.com/router/latest/docs/guide/external-data-loading

export function prefetchHome(): void {
  void ensure(queryClient.ensureQueryData(t.home.summary.queryOptions()));
  void ensure(queryClient.ensureQueryData(t.files.roomCovers.queryOptions()));
}

export function prefetchRooms(): void {
  void ensure(queryClient.ensureQueryData(t.rooms.list.queryOptions()));
  void ensure(queryClient.ensureQueryData(t.files.roomCovers.queryOptions()));
  void ensure(queryClient.ensureQueryData(t.shoppingLines.totals.queryOptions({})));
}

/** Jobs reads every job and the phases they're grouped under. */
export function prefetchJobs(): void {
  void ensure(queryClient.ensureQueryData(t.jobs.list.queryOptions()));
  void ensure(queryClient.ensureQueryData(t.phases.list.queryOptions()));
}

/** Phases reads the phases, and the open phase's jobs when one is open (`?phase=`). */
export function prefetchPhases({ phase }: { phase: string | undefined }): void {
  void ensure(queryClient.ensureQueryData(t.phases.list.queryOptions()));
  if (phase) void ensure(queryClient.ensureQueryData(t.jobs.list.queryOptions({ phaseId: phase })));
}

/** The shopping filters as the screen turns its search into them. */
export function shoppingDeps(search: ShoppingSearch) {
  return { filter: shoppingFilter(search), stores: shoppingFilter(withoutStore(search)) };
}

export function prefetchShopping({ filter, stores }: ReturnType<typeof shoppingDeps>): void {
  void ensure(queryClient.ensureQueryData(t.shoppingLines.list.queryOptions(filter)));
  void ensure(queryClient.ensureQueryData(t.shoppingLines.totals.queryOptions(filter)));
  void ensure(queryClient.ensureQueryData(t.shoppingLines.totals.queryOptions(stores)));
}

export function prefetchMoney(): void {
  void ensure(queryClient.ensureQueryData(t.money.summary.queryOptions()));
  void ensure(queryClient.ensureQueryData(t.budget.get.queryOptions()));
}

export function prefetchVendors(): void {
  void ensure(queryClient.ensureQueryData(t.vendors.list.queryOptions()));
}

export function prefetchManage(): void {
  void ensure(queryClient.ensureQueryData(t.categories.list.queryOptions()));
}
