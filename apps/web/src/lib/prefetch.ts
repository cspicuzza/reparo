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
    queryClient
      .ensureQueryData(t.payments.list.queryOptions({ jobId }))
      .then((list) =>
        queryClient.ensureQueryData(
          t.files.listMany.queryOptions({ ownerType: 'payment', ownerIds: list.map((p) => p.id) }),
        ),
      ),
  );
  void ensure(queryClient.ensureQueryData(t.shoppingLines.list.queryOptions({ jobId })));
  void ensure(
    queryClient.ensureQueryData(t.files.list.queryOptions({ ownerType: 'job', ownerId: jobId })),
  );
  void ensure(queryClient.ensureQueryData(t.files.forJob.queryOptions({ jobId })));
}
