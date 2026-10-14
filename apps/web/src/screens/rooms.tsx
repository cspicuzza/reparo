import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { primaryButtonClass } from '@/components/form';
import { useMe } from '@/lib/me';
import { useTRPC } from '@/lib/trpc';
import { describeRoom } from '@/lib/rooms';
import { RoomForm } from './room-form';

export function Rooms() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { canEdit } = useMe();
  const rooms = useQuery(trpc.rooms.list.queryOptions());
  const [adding, setAdding] = useState(false);
  const create = useMutation(
    trpc.rooms.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.rooms.pathFilter());
        setAdding(false);
      },
    }),
  );

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rooms</h1>
          <p className="mt-1 text-muted-foreground">
            {rooms.data ? `${rooms.data.length} in the house` : 'The spaces being worked on.'}
          </p>
        </div>
        {canEdit && !adding ? (
          <button type="button" onClick={() => setAdding(true)} className={primaryButtonClass}>
            Add a room
          </button>
        ) : null}
      </div>

      {adding ? (
        <div className="mt-8 rounded-lg border border-border p-5">
          <h2 className="text-lg font-medium">New room</h2>
          <div className="mt-4">
            <RoomForm
              idPrefix="new-room"
              submitLabel="Add room"
              serverError={create.error?.message}
              onCancel={() => {
                create.reset();
                setAdding(false);
              }}
              onSubmit={async (values) => {
                await create.mutateAsync(values).catch(() => undefined);
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-8">
        {rooms.isPending ? <p className="text-muted-foreground">Loading rooms…</p> : null}
        {rooms.error ? <p role="alert">Couldn&apos;t load rooms: {rooms.error.message}</p> : null}
        {rooms.data && rooms.data.length === 0 ? (
          <p className="text-muted-foreground">
            No rooms yet.{canEdit ? ' Add the first one above.' : ''}
          </p>
        ) : null}
        {rooms.data && rooms.data.length > 0 ? (
          <ul className="divide-y divide-border border-t border-b border-border">
            {rooms.data.map((room) => {
              const { dims, sqft } = describeRoom(room);
              return (
                <li key={room.id}>
                  <Link
                    to="/rooms/$roomId"
                    params={{ roomId: room.id }}
                    className="flex items-baseline justify-between gap-4 py-3 hover:bg-accent sm:px-2"
                  >
                    <span className="text-base font-medium">{room.name}</span>
                    <span className="shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                      {dims ?? 'Not measured'}
                      {sqft != null ? (
                        <span className="block sm:inline sm:before:content-['_·_']">
                          {sqft} sq ft
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
