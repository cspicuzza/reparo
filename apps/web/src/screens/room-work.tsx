import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { dangerButtonClass, quietButtonClass } from '@/components/form';
import { StatusBadge } from '@/components/status';
import { useMe } from '@/lib/me';
import { useTRPC } from '@/lib/trpc';
import type { ResolvedWork } from '@/lib/work';
import { WorkItemEditor } from './work-item-editor';

type Open = { itemId: string; mode: 'edit' | 'override' | 'add' } | null;

/**
 * Every item resolved for this room (docs/data-model.md → M1): the room's own work item if
 * there is one, else the item's house-wide default, else nothing yet.
 */
export function RoomWork({ roomId }: { roomId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { canEdit } = useMe();
  const work = useQuery(trpc.workItems.forRoom.queryOptions({ roomId }));
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

  if (work.isPending) return <p className="text-pencil">Loading work…</p>;
  if (work.error) return <p role="alert">Couldn&apos;t load work: {work.error.message}</p>;

  const withWork = work.data.filter((r) => r.work !== null);
  const without = work.data.filter((r) => r.work === null);

  return (
    <div>
      {withWork.length === 0 ? (
        <p className="text-pencil">Nothing specified for this room yet.</p>
      ) : (
        <ul className="divide-y divide-chalk border-t border-b border-chalk">
          {withWork.map((r) => (
            <li key={r.item.id} className="py-4 sm:px-2">
              {open?.itemId === r.item.id && open.mode !== 'add' && r.work ? (
                <Editing r={r} roomId={roomId} mode={open.mode} onClose={() => setOpen(null)} />
              ) : (
                <WorkRow
                  r={r}
                  canEdit={canEdit}
                  confirming={removing === r.work?.id}
                  busy={remove.isPending}
                  onEdit={() => setOpen({ itemId: r.item.id, mode: 'edit' })}
                  onOverride={() => setOpen({ itemId: r.item.id, mode: 'override' })}
                  onRemove={() => setRemoving(r.work?.id ?? null)}
                  onConfirmRemove={() => r.work && remove.mutate({ id: r.work.id })}
                  onCancelRemove={() => setRemoving(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {remove.error ? (
        <p role="alert" className="mt-2 text-sm">
          {remove.error.message}
        </p>
      ) : null}

      {without.length > 0 ? (
        <div className="mt-8">
          <h3 className="text-sm text-pencil">Not specified anywhere yet</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {without.map((r) =>
              open?.itemId === r.item.id && open.mode === 'add' ? (
                <li key={r.item.id} className="w-full rounded-lg border border-chalk p-4">
                  <h4 className="font-medium">{r.item.name} — this room</h4>
                  <div className="mt-3">
                    <WorkItemEditor
                      idPrefix={`add-${r.item.id}`}
                      target={{ kind: 'create', itemId: r.item.id, roomId }}
                      onDone={() => setOpen(null)}
                      onCancel={() => setOpen(null)}
                    />
                  </div>
                </li>
              ) : (
                <li key={r.item.id}>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => setOpen({ itemId: r.item.id, mode: 'add' })}
                      className="rounded-full border border-chalk px-3 py-1 text-sm text-pencil hover:border-ink hover:text-ink"
                    >
                      + {r.item.name}
                    </button>
                  ) : (
                    <span className="rounded-full border border-chalk px-3 py-1 text-sm text-pencil">
                      {r.item.name}
                    </span>
                  )}
                </li>
              ),
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function WorkRow({
  r,
  canEdit,
  confirming,
  busy,
  onEdit,
  onOverride,
  onRemove,
  onConfirmRemove,
  onCancelRemove,
}: {
  r: ResolvedWork;
  canEdit: boolean;
  confirming: boolean;
  busy: boolean;
  onEdit: () => void;
  onOverride: () => void;
  onRemove: () => void;
  onConfirmRemove: () => void;
  onCancelRemove: () => void;
}) {
  const w = r.work;
  if (!w) return null;
  const isDefault = r.source === 'default';
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            to="/items/$itemId"
            params={{ itemId: r.item.id }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {r.item.name}
          </Link>
          <StatusBadge status={w.status} />
          <span className="text-xs text-pencil">{isDefault ? 'House-wide' : 'This room'}</span>
        </div>
        {w.spec ? (
          <p className="mt-1 max-w-prose text-sm whitespace-pre-wrap">{w.spec}</p>
        ) : (
          <p className="mt-1 text-sm text-pencil">No spec yet.</p>
        )}
        {w.notes ? (
          <p className="mt-1 max-w-prose text-sm text-pencil whitespace-pre-wrap">{w.notes}</p>
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-start gap-1 text-sm sm:justify-end">
          {isDefault ? (
            <button type="button" onClick={onOverride} className={quietButtonClass}>
              Override for this room
            </button>
          ) : confirming ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirmRemove}
                className={dangerButtonClass}
              >
                Remove override
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

function Editing({
  r,
  roomId,
  mode,
  onClose,
}: {
  r: ResolvedWork;
  roomId: string;
  mode: 'edit' | 'override';
  onClose: () => void;
}) {
  const w = r.work;
  if (!w) return null;
  return (
    <div className="rounded-lg border border-chalk p-4">
      <h4 className="font-medium">
        {r.item.name} — {mode === 'override' ? 'override for this room' : 'this room'}
      </h4>
      {mode === 'override' ? (
        <p className="mt-1 text-sm text-pencil">
          Starts from the house-wide spec; change what&apos;s different here.
        </p>
      ) : null}
      <div className="mt-3">
        <WorkItemEditor
          idPrefix={`wi-${r.item.id}`}
          target={
            mode === 'edit'
              ? { kind: 'edit', workItem: w }
              : { kind: 'create', itemId: r.item.id, roomId, from: w }
          }
          onDone={onClose}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
