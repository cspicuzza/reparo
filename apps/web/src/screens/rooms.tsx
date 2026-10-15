import { useReturnFocus } from '@/lib/editor-focus';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useMe } from '@/lib/me';
import { useTRPC } from '@/lib/trpc';
import { describeRoom, roomProgressText } from '@/lib/rooms';
import { ChevronRight, Plus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EditPanel } from '@/components/edit-panel';
import { PanelList } from '@/components/panel';
import { PlanGrid } from '@/components/plan-grid';
import { TapeStrip } from '@/components/tape';
import { RoomForm } from './room-form';
import { Button } from '@/components/ui/button';
import { ListPlaceholder } from '@/components/placeholder';

export function Rooms() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { canEdit } = useMe();
  const rooms = useQuery(trpc.rooms.list.queryOptions());
  const covers = useQuery(trpc.files.roomCovers.queryOptions());
  const coverOf = new Map((covers.data ?? []).map((c) => [c.roomId, c.url]));
  const [adding, setAdding] = useState(false);
  useReturnFocus(adding ? 'add-room' : null);
  const create = useMutation(
    trpc.rooms.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.rooms.pathFilter());
        setAdding(false);
      },
    }),
  );

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        title="Rooms"
        description={
          rooms.data && rooms.data.length > 0
            ? `${rooms.data.length} in the house`
            : 'The spaces being worked on.'
        }
        action={
          canEdit ? (
            <Button type="button" onClick={() => setAdding(true)} data-return-focus="add-room">
              <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
              Add a room
            </Button>
          ) : null
        }
      />

      <EditPanel
        open={adding}
        title="New room"
        onClose={() => {
          create.reset();
          setAdding(false);
        }}
      >
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
      </EditPanel>

      {rooms.isPending ? <ListPlaceholder label="Loading rooms" rows={6} /> : null}
      {rooms.error ? <p role="alert">Couldn&apos;t load rooms: {rooms.error.message}</p> : null}
      {rooms.data && rooms.data.length === 0 ? (
        <PlanGrid className="h-56 flex-col gap-3 rounded-xl text-base">
          <span>No rooms yet.</span>
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdding(true)}
              data-return-focus="add-room"
            >
              <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
              Add the first room
            </Button>
          ) : null}
        </PlanGrid>
      ) : null}
      {rooms.data && rooms.data.length > 0 ? (
        <PanelList>
          {rooms.data.map((room) => {
            const { dims, sqft } = describeRoom(room);
            const size = dims ? (sqft != null ? `${dims}, ${sqft} sq ft` : dims) : 'Not measured';
            const progress = roomProgressText(room.progress);
            const cover = coverOf.get(room.id);
            return (
              <li key={room.id}>
                <Link
                  to="/rooms/$roomId"
                  params={{ roomId: room.id }}
                  className="flex min-h-16 items-center gap-4 px-4 py-3 hover:bg-accent sm:px-5"
                >
                  {cover ? (
                    <img
                      src={cover}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-14 w-20 shrink-0 rounded-lg border border-border bg-inset object-cover"
                    />
                  ) : (
                    <PlanGrid className="h-14 w-20 shrink-0 rounded-lg p-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xl font-semibold">{room.name}</span>
                    <span className="block text-sm text-muted-foreground tabular-nums">{size}</span>
                  </span>
                  <span className="hidden w-40 shrink-0 sm:block">
                    {room.progress.total > 0 ? (
                      <TapeStrip
                        mode="progress"
                        size="sm"
                        done={room.progress.done}
                        total={room.progress.total}
                        label={`${room.name}: ${progress}`}
                      />
                    ) : null}
                  </span>
                  <span className="shrink-0 text-right text-sm text-muted-foreground tabular-nums sm:w-36 sm:text-left">
                    {progress}
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </PanelList>
      ) : null}
    </section>
  );
}
