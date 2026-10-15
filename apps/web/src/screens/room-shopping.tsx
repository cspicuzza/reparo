import { useReturnFocus } from '@/lib/editor-focus';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { useTRPC } from '@/lib/trpc';
import { useInvalidateShopping } from '@/lib/use-invalidate-shopping';
import { ShoppingLineForm } from './shopping-line-form';
import { ShoppingList } from './shopping-list';

/** A room's "What we're buying" (M3, OD-52): its shopping lines, and adding one for this room. */
export function RoomShopping({ roomId, roomName }: { roomId: string; roomName: string }) {
  const trpc = useTRPC();
  const { canEdit } = useMe();
  const lines = useQuery(trpc.shoppingLines.list.queryOptions({ roomId }));
  const invalidate = useInvalidateShopping();
  const [adding, setAdding] = useState(false);
  useReturnFocus(adding ? `add-line-${roomId}` : null);
  const create = useMutation(
    trpc.shoppingLines.create.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setAdding(false);
      },
    }),
  );

  return (
    <div>
      {lines.isPending ? <p className="text-muted-foreground">Loading…</p> : null}
      {lines.error ? <p role="alert">Couldn&apos;t load: {lines.error.message}</p> : null}
      {lines.data && lines.data.length === 0 && !adding ? (
        <p className="text-muted-foreground">Nothing on the list for {roomName} yet.</p>
      ) : null}
      {lines.data && lines.data.length > 0 ? (
        <ShoppingList lines={lines.data} canEdit={canEdit} showRoom={false} />
      ) : null}
      {adding ? (
        <div className="mt-4 rounded-xl border border-border bg-background p-4">
          <ShoppingLineForm
            idPrefix={`room-line-${roomId}`}
            defaults={{ roomId }}
            submitLabel="Add to the list"
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
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdding(true)}
              data-return-focus={`add-line-${roomId}`}
            >
              Add something for {roomName}
            </Button>
          ) : null}
          <Link
            to="/shopping"
            search={{ room: roomId }}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            See it on the shopping list
          </Link>
        </div>
      )}
    </div>
  );
}
