import { useReturnFocus } from '@/lib/editor-focus';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useMe } from '@/lib/me';
import { useTRPC } from '@/lib/trpc';
import { describeRoom, roomProgressText } from '@/lib/rooms';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EditPanel } from '@/components/edit-panel';
import { PanelList } from '@/components/panel';
import { PlanGrid } from '@/components/plan-grid';
import { RoomOutline } from '@/components/dimension';
import { money } from '@/lib/money';
import { TapeStrip } from '@/components/tape';
import { RoomForm } from './room-form';
import { Button } from '@/components/ui/button';
import { ListPlaceholder } from '@/components/placeholder';
import { FormError } from '@/components/form';
import { LoadError } from '@/components/load-error';
import { MoveButtons } from '@/components/move-buttons';

/**
 * The rooms (M1; as plans, OD-140): a card per room with its cover or its outline, size, what's
 * left to buy and how its jobs are going. Change order turns the cards into a list to arrange.
 */
export function Rooms() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { canEdit } = useMe();
  const rooms = useQuery(trpc.rooms.list.queryOptions());
  const covers = useQuery(trpc.files.roomCovers.queryOptions());
  const coverOf = new Map((covers.data ?? []).map((c) => [c.roomId, c.url]));
  // What's left to buy for each room, from the shopping totals (OD-140).
  const shopping = useQuery(trpc.shoppingLines.totals.queryOptions({}));
  const toBuy = new Map(
    (shopping.data?.find((sec) => sec.status === 'to_buy')?.rooms ?? []).map((r) => [r.roomId, r]),
  );
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
  const [arranging, setArranging] = useState(false);
  const move = useMutation(
    trpc.rooms.move.mutationOptions({
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries(trpc.rooms.pathFilter()),
          queryClient.invalidateQueries(trpc.home.pathFilter()),
        ]),
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
            <div className="flex flex-wrap gap-2">
              {rooms.data && rooms.data.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  aria-pressed={arranging}
                  onClick={() => setArranging((v) => !v)}
                >
                  {arranging ? 'Done' : 'Change order'}
                </Button>
              ) : null}
              <Button type="button" onClick={() => setAdding(true)} data-return-focus="add-room">
                <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
                Add a room
              </Button>
            </div>
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
      {rooms.error ? <LoadError what="the rooms" error={rooms.error} retry={[rooms]} /> : null}
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
      {rooms.data && rooms.data.length > 0 && arranging ? (
        // Putting the rooms in order: each row moves up or down (OD-117, Q141).
        <PanelList>
          {rooms.data.map((room, index) => (
            <li
              key={room.id}
              className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5"
            >
              <span className="min-w-0 text-xl font-semibold break-words">{room.name}</span>
              <MoveButtons
                id={room.id}
                name={room.name}
                index={index}
                count={rooms.data.length}
                disabled={move.isPending}
                onMove={(by) => move.mutateAsync({ id: room.id, by }).catch(() => undefined)}
              />
            </li>
          ))}
        </PanelList>
      ) : null}
      {rooms.data && rooms.data.length > 0 && !arranging ? (
        // The house as a set of plans (OD-140): each room's cover or its outline drawn to its
        // proportions, its size, what's left to buy for it, and how its jobs are going.
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.data.map((room) => {
            const { dims, sqft } = describeRoom(room);
            const size = dims ? (sqft != null ? `${dims}, ${sqft} sq ft` : dims) : 'Not measured';
            const progress = roomProgressText(room.progress);
            const cover = coverOf.get(room.id);
            const buying = toBuy.get(room.id);
            return (
              <li key={room.id}>
                <Link
                  to="/rooms/$roomId"
                  params={{ roomId: room.id }}
                  className="flex h-full gap-4 rounded-xl border border-border bg-card p-4 transition-colors duration-150 hover:bg-accent"
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
                    <RoomOutline lengthIn={room.lengthIn} widthIn={room.widthIn} />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <h2 className="text-xl break-words">{room.name}</h2>
                    <span className="text-sm text-muted-foreground tabular-nums">{size}</span>
                    <span className="text-sm tabular-nums">
                      {buying
                        ? buying.totalCents > 0
                          ? `${buying.count} to buy, ${money(buying.totalCents)}`
                          : `${buying.count} to buy, no prices yet`
                        : 'Nothing left to buy'}
                    </span>
                    {room.progress.total > 0 ? (
                      <TapeStrip
                        mode="progress"
                        size="sm"
                        done={room.progress.done}
                        total={room.progress.total}
                        label={`${room.name}: ${progress}`}
                        className="mt-2"
                      />
                    ) : null}
                    <span className="text-sm text-muted-foreground tabular-nums">{progress}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {move.error ? <FormError>{move.error.message}</FormError> : null}
    </section>
  );
}
