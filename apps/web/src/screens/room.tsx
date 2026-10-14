import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { formatLength } from '@reparo/shared';
import { useState } from 'react';
import { dangerButtonClass, primaryButtonClass, quietButtonClass } from '@/components/form';
import { useMe } from '@/lib/me';
import { trpcErrorCode, useTRPC } from '@/lib/trpc';
import { describeRoom } from '@/lib/rooms';
import { RoomForm } from './room-form';
import { RoomWork } from './room-work';

export function RoomDetail() {
  const { roomId } = useParams({ from: '/_app/rooms/$roomId' });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { canEdit } = useMe();
  const room = useQuery(trpc.rooms.get.queryOptions({ id: roomId }));
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const invalidate = () => queryClient.invalidateQueries(trpc.rooms.pathFilter());
  const update = useMutation(
    trpc.rooms.update.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setEditing(false);
      },
    }),
  );
  const remove = useMutation(
    trpc.rooms.remove.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        await navigate({ to: '/rooms' });
      },
    }),
  );

  if (room.isPending) return <p className="text-pencil">Loading…</p>;
  if (room.error) {
    const gone = trpcErrorCode(room.error) === 'NOT_FOUND';
    return (
      <section>
        <p role="alert">{gone ? 'That room is no longer here.' : room.error.message}</p>
        <Link to="/rooms" className={`mt-4 inline-block ${quietButtonClass} px-0`}>
          ← All rooms
        </Link>
      </section>
    );
  }
  const r = room.data;
  const { dims, sqft } = describeRoom(r);

  return (
    <section>
      <Link to="/rooms" className="text-sm text-pencil underline-offset-4 hover:underline">
        ← All rooms
      </Link>

      {editing ? (
        <div className="mt-4">
          <h1 className="text-2xl font-semibold tracking-tight">Edit {r.name}</h1>
          <div className="mt-6">
            <RoomForm
              idPrefix="edit-room"
              room={r}
              submitLabel="Save"
              serverError={update.error?.message}
              onCancel={() => {
                update.reset();
                setEditing(false);
              }}
              onSubmit={async (values) => {
                await update.mutateAsync({ id: r.id, ...values }).catch(() => undefined);
              }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">{r.name}</h1>
            {canEdit ? (
              <button type="button" onClick={() => setEditing(true)} className={primaryButtonClass}>
                Edit
              </button>
            ) : null}
          </div>

          <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Measurement label="Length" value={r.lengthIn} />
            <Measurement label="Width" value={r.widthIn} />
            <Measurement label="Ceiling height" value={r.ceilingHeightIn} />
            <div>
              <dt className="text-sm text-pencil">Floor area</dt>
              <dd className="mt-0.5 text-lg tabular-nums">
                {sqft != null ? `${sqft} sq ft` : dims ? 'Needs both sides' : '—'}
              </dd>
            </div>
          </dl>

          {r.notes ? (
            <div className="mt-6">
              <h2 className="text-sm text-pencil">Notes</h2>
              <p className="mt-1 max-w-prose whitespace-pre-wrap">{r.notes}</p>
            </div>
          ) : null}

          <div className="mt-10">
            <h2 className="text-lg font-medium">Jobs in this room</h2>
            <p className="mt-1 text-sm text-pencil">
              Each job&apos;s status here, and its spec — the job&apos;s, or one just for this room.
            </p>
            <div className="mt-4">
              <RoomWork roomId={r.id} roomName={r.name} />
            </div>
          </div>

          {canEdit ? (
            <div className="mt-12 border-t border-chalk pt-6">
              {confirmingDelete ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm">Remove {r.name} from the house?</span>
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ id: r.id })}
                    className={dangerButtonClass}
                  >
                    Yes, remove it
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className={quietButtonClass}
                  >
                    Keep it
                  </button>
                  {remove.error ? (
                    <p role="alert" className="w-full text-sm">
                      {remove.error.message}
                    </p>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className={quietButtonClass + ' px-0 text-pencil'}
                >
                  Remove this room
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Measurement({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="text-sm text-pencil">{label}</dt>
      <dd className="mt-0.5 text-lg tabular-nums">{value == null ? '—' : formatLength(value)}</dd>
    </div>
  );
}
