import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { dangerButtonClass, primaryButtonClass, quietButtonClass } from '@/components/form';
import { StatusBadge } from '@/components/status';
import { useMe } from '@/lib/me';
import { trpcErrorCode, useTRPC } from '@/lib/trpc';
import type { WorkItem } from '@/lib/work';
import { WorkItemEditor } from './work-item-editor';

type Open = { key: string; mode: 'edit' | 'create' } | null;

/** One item across the house: its house-wide default, then every room's override or inheritance. */
export function ItemDetail() {
  const { itemId } = useParams({ from: '/_app/items/$itemId' });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { canEdit } = useMe();
  const item = useQuery(trpc.items.get.queryOptions({ id: itemId }));
  const rooms = useQuery(trpc.rooms.list.queryOptions());
  const work = useQuery(trpc.workItems.list.queryOptions({ itemId }));
  const [open, setOpen] = useState<Open>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const remove = useMutation(
    trpc.workItems.remove.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.workItems.pathFilter());
        setRemoving(null);
      },
    }),
  );

  if (item.isPending || rooms.isPending || work.isPending) {
    return <p className="text-pencil">Loading…</p>;
  }
  const err = item.error ?? rooms.error ?? work.error;
  if (err) {
    return (
      <section>
        <p role="alert">
          {trpcErrorCode(err) === 'NOT_FOUND' ? 'That item is no longer here.' : err.message}
        </p>
        <Link to="/items" className="mt-4 inline-block text-sm text-pencil hover:underline">
          ← All items
        </Link>
      </section>
    );
  }

  const itemRow = item.data;
  const roomRows = rooms.data;
  const workRows = work.data;
  if (!itemRow || !roomRows || !workRows) return <p className="text-pencil">Loading…</p>;
  const houseDefault = workRows.find((w) => w.roomId === null) ?? null;
  const byRoom = new Map(workRows.filter((w) => w.roomId !== null).map((w) => [w.roomId, w]));
  const retired = itemRow.retiredAt !== null;

  return (
    <section>
      <Link to="/items" className="text-sm text-pencil underline-offset-4 hover:underline">
        ← All items
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {itemRow.name}
        {retired ? <span className="ml-3 text-base font-normal text-pencil">retired</span> : null}
      </h1>

      <h2 className="mt-8 text-lg font-medium">House-wide</h2>
      <p className="mt-1 text-sm text-pencil">
        The default for every room that doesn&apos;t say otherwise.
      </p>
      <div className="mt-3 rounded-lg border border-chalk p-4">
        {open?.key === 'default' ? (
          <WorkItemEditor
            idPrefix="default"
            target={
              houseDefault && open.mode === 'edit'
                ? { kind: 'edit', workItem: houseDefault }
                : { kind: 'create', itemId, roomId: null }
            }
            onDone={() => setOpen(null)}
            onCancel={() => setOpen(null)}
          />
        ) : houseDefault ? (
          <WorkCard
            w={houseDefault}
            canEdit={canEdit}
            confirming={removing === houseDefault.id}
            busy={remove.isPending}
            onEdit={() => setOpen({ key: 'default', mode: 'edit' })}
            onRemove={() => setRemoving(houseDefault.id)}
            onConfirmRemove={() => remove.mutate({ id: houseDefault.id })}
            onCancelRemove={() => setRemoving(null)}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-pencil">No house-wide spec yet.</p>
            {canEdit && !retired ? (
              <button
                type="button"
                onClick={() => setOpen({ key: 'default', mode: 'create' })}
                className={primaryButtonClass}
              >
                Add house-wide spec
              </button>
            ) : null}
          </div>
        )}
      </div>

      <h2 className="mt-10 text-lg font-medium">By room</h2>
      {roomRows.length === 0 ? (
        <p className="mt-2 text-pencil">
          No rooms yet —{' '}
          <Link to="/rooms" className="underline underline-offset-4">
            add them
          </Link>{' '}
          first.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-chalk border-t border-b border-chalk">
          {roomRows.map((room) => {
            const override = byRoom.get(room.id) ?? null;
            const key = `room-${room.id}`;
            return (
              <li key={room.id} className="py-4 sm:px-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    to="/rooms/$roomId"
                    params={{ roomId: room.id }}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {room.name}
                  </Link>
                  {override ? (
                    <StatusBadge status={override.status} />
                  ) : houseDefault ? (
                    <span className="text-xs text-pencil">uses house-wide</span>
                  ) : (
                    <span className="text-xs text-pencil">nothing yet</span>
                  )}
                </div>
                <div className="mt-2">
                  {open?.key === key ? (
                    <div className="rounded-lg border border-chalk p-4">
                      <WorkItemEditor
                        idPrefix={key}
                        target={
                          override && open.mode === 'edit'
                            ? { kind: 'edit', workItem: override }
                            : { kind: 'create', itemId, roomId: room.id, from: houseDefault }
                        }
                        onDone={() => setOpen(null)}
                        onCancel={() => setOpen(null)}
                      />
                    </div>
                  ) : override ? (
                    <WorkCard
                      w={override}
                      canEdit={canEdit}
                      confirming={removing === override.id}
                      busy={remove.isPending}
                      onEdit={() => setOpen({ key, mode: 'edit' })}
                      onRemove={() => setRemoving(override.id)}
                      onConfirmRemove={() => remove.mutate({ id: override.id })}
                      onCancelRemove={() => setRemoving(null)}
                      removeLabel="Remove override"
                    />
                  ) : canEdit && !retired ? (
                    <button
                      type="button"
                      onClick={() => setOpen({ key, mode: 'create' })}
                      className={quietButtonClass + ' px-0'}
                    >
                      {houseDefault ? 'Override for this room' : 'Add for this room'}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {remove.error ? (
        <p role="alert" className="mt-2 text-sm">
          {remove.error.message}
        </p>
      ) : null}
    </section>
  );
}

function WorkCard({
  w,
  canEdit,
  confirming,
  busy,
  onEdit,
  onRemove,
  onConfirmRemove,
  onCancelRemove,
  removeLabel = 'Remove',
}: {
  w: WorkItem;
  canEdit: boolean;
  confirming: boolean;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onConfirmRemove: () => void;
  onCancelRemove: () => void;
  removeLabel?: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:gap-6">
      <div className="min-w-0">
        <StatusBadge status={w.status} />
        {w.spec ? (
          <p className="mt-2 max-w-prose text-sm whitespace-pre-wrap">{w.spec}</p>
        ) : (
          <p className="mt-2 text-sm text-pencil">No spec yet.</p>
        )}
        {w.notes ? (
          <p className="mt-1 max-w-prose text-sm text-pencil whitespace-pre-wrap">{w.notes}</p>
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-start gap-1 text-sm sm:justify-end">
          {confirming ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirmRemove}
                className={dangerButtonClass}
              >
                {removeLabel}
              </button>
              <button type="button" onClick={onCancelRemove} className={quietButtonClass}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onEdit} className={quietButtonClass}>
                Edit
              </button>
              <button
                type="button"
                onClick={onRemove}
                className={quietButtonClass + ' text-pencil'}
              >
                Remove
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
