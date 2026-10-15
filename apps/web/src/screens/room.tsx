import { useReturnFocus } from '@/lib/editor-focus';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { useMe } from '@/lib/me';
import { trpcErrorCode, useTRPC } from '@/lib/trpc';
import { describeRoom, roomProgressText } from '@/lib/rooms';
import { DimensionLine } from '@/components/dimension';
import { PlanGrid } from '@/components/plan-grid';
import { RoomForm } from './room-form';
import { RoomPictures } from './room-pictures';
import { RoomShopping } from './room-shopping';
import { RoomWork } from './room-work';
import { Button, buttonVariants } from '@/components/ui/button';
import { FormError } from '@/components/form';

export function RoomDetail() {
  const { roomId } = useParams({ from: '/_app/rooms/$roomId' });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { canEdit } = useMe();
  const room = useQuery(trpc.rooms.get.queryOptions({ id: roomId }));
  const [editing, setEditing] = useState(false);
  useReturnFocus(editing ? 'edit-room' : null);
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

  if (room.isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (room.error) {
    const gone = trpcErrorCode(room.error) === 'NOT_FOUND';
    return (
      <section>
        <p role="alert">{gone ? 'That room is no longer here.' : room.error.message}</p>
        <Link to="/rooms" className={buttonVariants({ variant: 'ghost', className: 'mt-4 px-0' })}>
          All rooms
        </Link>
      </section>
    );
  }
  const r = room.data;
  const { dims, sqft } = describeRoom(r);

  return (
    <section>
      <Link
        to="/rooms"
        className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft aria-hidden className="size-5" />
        All rooms
      </Link>

      {editing ? (
        <div className="mt-4">
          <h1 className="text-3xl">Edit {r.name}</h1>
          <div className="mt-6">
            <RoomForm
              idPrefix="edit-room"
              room={r}
              submitLabel="Save room"
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
        <>
          <RoomCover roomId={r.id} roomName={r.name} />

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-4xl">{r.name}</h1>
              <p className="mt-2 text-muted-foreground">{roomProgressText(r.progress)}</p>
            </div>
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(true)}
                data-return-focus="edit-room"
              >
                Edit room
              </Button>
            ) : null}
          </div>

          <section
            aria-label="Size"
            className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6"
          >
            <dl className="flex flex-wrap gap-x-8 gap-y-5">
              <DimensionLine label="Length" inches={r.lengthIn} className="flex-1" />
              <DimensionLine label="Width" inches={r.widthIn} className="flex-1" />
              <DimensionLine label="Ceiling" inches={r.ceilingHeightIn} className="flex-1" />
              <div className="min-w-36">
                <dt className="text-sm text-muted-foreground">Floor area</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">
                  {sqft != null ? (
                    `${sqft} sq ft`
                  ) : (
                    <span className="text-base font-normal text-muted-foreground">
                      {dims ? 'Needs both sides' : 'Not measured'}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
            {r.notes ? (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="mt-1 max-w-prose whitespace-pre-wrap">{r.notes}</p>
              </div>
            ) : null}
          </section>

          <section
            aria-labelledby="room-pictures"
            className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6"
          >
            <h2 id="room-pictures" className="text-2xl">
              Pictures
            </h2>
            <div className="mt-4">
              <RoomPictures roomId={r.id} roomName={r.name} canEdit={canEdit} />
            </div>
          </section>

          <section
            aria-labelledby="room-jobs"
            className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6"
          >
            <h2 id="room-jobs" className="text-2xl">
              Jobs in this room
            </h2>
            <p className="mt-1 text-muted-foreground">
              Set each job&apos;s status here. Jobs are planned on the Jobs page.
            </p>
            <div className="mt-4">
              <RoomWork roomId={r.id} roomName={r.name} />
            </div>
          </section>

          <section
            aria-labelledby="room-buying"
            className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6"
          >
            <h2 id="room-buying" className="text-2xl">
              What we&apos;re buying
            </h2>
            <div className="mt-4">
              <RoomShopping roomId={r.id} roomName={r.name} />
            </div>
          </section>

          {canEdit ? (
            <div className="mt-12 border-t border-border pt-6">
              {confirmingDelete ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span>Remove {r.name} from the house?</span>
                  <Button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ id: r.id })}
                    variant="destructive"
                  >
                    Yes, remove it
                  </Button>
                  <Button type="button" onClick={() => setConfirmingDelete(false)} variant="ghost">
                    Keep it
                  </Button>
                  {remove.error ? (
                    <FormError className="w-full">{remove.error.message}</FormError>
                  ) : null}
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  variant="ghost"
                  className="px-0 text-muted-foreground"
                >
                  Remove this room
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * The room's cover rendering at the top of the page (M4, OD-57; Q16), or the plan-grid
 * placeholder until one is chosen. Shares the room's files query with the Pictures section.
 */
function RoomCover({ roomId, roomName }: { roomId: string; roomName: string }) {
  const trpc = useTRPC();
  const files = useQuery(trpc.files.list.queryOptions({ ownerType: 'room', ownerId: roomId }));
  const cover = files.data?.find((f) => f.isCover && f.url);
  if (cover?.url) {
    return (
      <img
        src={cover.url}
        alt={cover.caption || `The ${roomName}, as it will look`}
        className="mt-2 h-48 w-full rounded-xl border border-border bg-inset object-cover sm:h-80"
      />
    );
  }
  const hasRenderings = files.data?.some((f) => f.kind === 'rendering') ?? false;
  return (
    <PlanGrid className="mt-2 h-48 rounded-xl sm:h-80">
      {hasRenderings
        ? `No cover picture yet. Open a rendering below and make it the cover.`
        : `No picture of the ${roomName} yet`}
    </PlanGrid>
  );
}
