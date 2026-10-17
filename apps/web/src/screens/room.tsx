import { useReturnFocus } from '@/lib/editor-focus';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronLeft, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useMe } from '@/lib/me';
import { trpcClient, trpcErrorCode, useTRPC } from '@/lib/trpc';
import { problemWith } from '@/lib/problem';
import { formatLength, roomUpdateSchema } from '@reparo/shared';
import type { RouterOutputs } from '@reparo/api';

type Room = RouterOutputs['rooms']['get'];
type RoomUpdateInput = Parameters<typeof trpcClient.rooms.update.mutate>[0];
import { describeRoom, roomBlockedText, roomProgressText } from '@/lib/rooms';
import { undoAction, useToasts } from '@/lib/toasts';
import { FloorPlan, MeasuredValue } from '@/components/dimension';
import { AutoSaveField } from '@/components/auto-save-field';
import { EditPanel } from '@/components/edit-panel';
import { PanelNameField } from '@/components/panel-name-field';
import { RoomPictures } from './room-pictures';
import { RoomShopping } from './room-shopping';
import { RoomWork } from './room-work';
import { Button, buttonVariants } from '@/components/ui/button';
import { FormError } from '@/components/form';
import { PageTitle } from '@/components/page-title';
import { PagePlaceholder } from '@/components/placeholder';
import { LoadError } from '@/components/load-error';
import { ConfirmRemove } from '@/components/confirm-remove';
import { BoughtTape } from '@/components/bought-tape';
import { useRefreshRooms } from '@/lib/refresh';

export function RoomDetail() {
  const { roomId } = useParams({ from: '/_app/rooms/$roomId' });
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { canEdit } = useMe();
  const room = useQuery(trpc.rooms.get.queryOptions({ id: roomId }));
  const [editing, setEditing] = useState(false);
  useReturnFocus(editing ? 'edit-room' : null);
  const toasts = useToasts();

  const invalidate = useRefreshRooms();
  // Removing offers Undo for 10 seconds (OD-113, Q142).
  const remove = useMutation(
    trpc.rooms.remove.mutationOptions({
      onSuccess: async (_data, { id }) => {
        const name = room.data?.name ?? 'the room';
        await invalidate();
        await navigate({ to: '/rooms' });
        toasts.add({
          title: `Removed ${name}`,
          timeout: 10_000,
          actionProps: undoAction(toasts, () =>
            trpcClient.rooms.restore.mutate({ id }).then(invalidate),
          ),
        });
      },
    }),
  );

  const saveRoom = (input: RoomUpdateInput) =>
    trpcClient.rooms.update.mutate(input).then(() => invalidate());

  if (room.isPending) {
    return (
      <>
        <PageTitle parts={['Rooms']} />
        <PagePlaceholder label="Loading the room" />
      </>
    );
  }
  if (room.error) {
    const gone = trpcErrorCode(room.error) === 'NOT_FOUND';
    return (
      <section>
        <PageTitle parts={['Rooms']} />
        {gone ? (
          <p role="alert">That room is no longer here.</p>
        ) : (
          <LoadError what="this room" error={room.error} retry={[room]} />
        )}
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

      <RoomCover roomId={r.id} roomName={r.name} />

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <PageTitle parts={[r.name, 'Rooms']} />
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
            <Pencil aria-hidden absoluteStrokeWidth strokeWidth={2} />
            Edit room
          </Button>
        ) : null}
      </div>

      {/* What's bought for this room against what's left to buy (OD-118, Q143). */}
      <BoughtTape
        boughtCents={r.shopping.boughtCents}
        leftCents={r.shopping.leftCents}
        className="mt-5"
      />

      <section
        aria-labelledby="room-jobs"
        className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6"
      >
        <h2 id="room-jobs" className="text-2xl">
          Jobs in this room
        </h2>
        {/* Only for those who can (OD-143). */}
        {canEdit ? (
          <p className="mt-1 text-muted-foreground">Set each job&apos;s status here.</p>
        ) : null}
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
        aria-labelledby="room-size"
        className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6"
      >
        <h2 id="room-size" className="mb-4 text-2xl">
          Size and notes
        </h2>
        {canEdit ? (
          <RoomSizeFields room={r} />
        ) : (
          <FloorPlan
            lengthIn={r.lengthIn}
            widthIn={r.widthIn}
            length={<MeasuredValue label="Length" inches={r.lengthIn} />}
            width={<MeasuredValue label="Width" inches={r.widthIn} />}
            ceiling={<MeasuredValue label="Ceiling" inches={r.ceilingHeightIn} />}
            area={<FloorArea sqft={sqft} dims={dims} />}
          />
        )}
        {canEdit ? (
          <div className="mt-5 border-t border-border pt-4">
            <AutoSaveField
              id={`room-notes-${r.id}`}
              label="Notes"
              initial={r.notes}
              multiline
              inputClassName="max-w-prose"
              what={`Notes for the ${r.name}`}
              validate={(v) => problemWith(roomUpdateSchema.shape.notes, v)}
              onSave={(v) => saveRoom({ id: r.id, notes: v })}
            />
          </div>
        ) : r.notes ? (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">Notes</p>
            <p className="mt-1 max-w-prose whitespace-pre-wrap">{r.notes}</p>
          </div>
        ) : null}
      </section>

      {canEdit ? (
        <div className="mt-12 border-t border-border pt-6">
          <ConfirmRemove
            strong
            what={r.name}
            label="Remove this room"
            question={`Remove ${r.name} from the house?`}
            blocked={roomBlockedText(r.name, r.attached)}
            disabled={remove.isPending}
            onConfirm={() => remove.mutate({ id: r.id })}
          />
          {remove.error ? <FormError>{remove.error.message}</FormError> : null}
        </div>
      ) : null}
      {/* Edited in place (OD-89). Size and notes already save on this page, so the panel
          doesn't repeat them. */}
      <EditPanel
        open={editing}
        title={r.name}
        focusFirstField={false}
        heading={
          <PanelNameField
            id={`room-name-${r.id}`}
            initial={r.name}
            what={`Name of ${r.name}`}
            validate={(v) => problemWith(roomUpdateSchema.shape.name, v)}
            onSave={(v) => saveRoom({ id: r.id, name: v })}
          />
        }
        onClose={() => setEditing(false)}
      >
        {/* The order moved to Move up / Move down on the Rooms list (OD-117, Q141). */}
        <p className="text-muted-foreground">
          The size and notes save right on the room&apos;s page. To change where it sits in the
          list, use Change order on the Rooms page.
        </p>
      </EditPanel>
    </section>
  );
}

/**
 * The room's cover rendering at the top of the page (M4, OD-57; Q16), or nothing until one is
 * chosen. Shares the room's files query with the Pictures section.
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
  // No cover yet: the page starts with its heading, not an empty band (OD-129, Q182).
  return null;
}

/** What's written inside the floor plan: the area, or why there isn't one yet. */
function FloorArea({ sqft, dims }: { sqft: number | null; dims: string | null }) {
  return sqft != null ? (
    <p>
      <span className="block text-2xl font-semibold tabular-nums">{sqft} sq ft</span>
      <span className="text-sm text-muted-foreground">Floor area</span>
    </p>
  ) : (
    <p className="text-muted-foreground">{dims ? 'Needs both sides' : 'Not measured yet'}</p>
  );
}

/**
 * The room's size for editors (OD-77): each measurement is a field inside its dimension line
 * that saves when you leave it, checked by the same schema as the API. Floor area follows.
 */
function RoomSizeFields({ room: r }: { room: Room }) {
  const refresh = useRefreshRooms();
  const { dims, sqft } = describeRoom(r);
  const save = (input: RoomUpdateInput) => trpcClient.rooms.update.mutate(input).then(refresh);
  const field = (key: 'lengthIn' | 'widthIn' | 'ceilingHeightIn', label: string) => {
    const value = r[key];
    return (
      <AutoSaveField
        id={`room-${key}-${r.id}`}
        label={label}
        labelClassName="text-center w-full"
        initial={value == null ? '' : formatLength(value)}
        inputClassName="text-center text-xl font-semibold tabular-nums"
        what={`${label} of the ${r.name}`}
        validate={(v) => problemWith(roomUpdateSchema.shape[key], v)}
        onSave={(v) => save({ id: r.id, [key]: v })}
      />
    );
  };
  return (
    <div className="flex flex-col gap-5">
      {/* Drawn as a floor plan, each size on its own dimension line (OD-128, Q180). */}
      <FloorPlan
        fields
        lengthIn={r.lengthIn}
        widthIn={r.widthIn}
        length={field('lengthIn', 'Length')}
        width={field('widthIn', 'Width')}
        ceiling={field('ceilingHeightIn', 'Ceiling')}
        area={<FloorArea sqft={sqft} dims={dims} />}
      />
      <p className="text-sm text-muted-foreground">
        Feet and inches, like 14&apos; 6 1/2&quot;, or plain inches.
      </p>
    </div>
  );
}
