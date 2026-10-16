import { Plus } from 'lucide-react';
import { useReturnFocus } from '@/lib/editor-focus';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { EditPanel } from '@/components/edit-panel';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { useTRPC } from '@/lib/trpc';
import { useRefreshShopping } from '@/lib/refresh';
import { ShoppingLineForm } from './shopping-line-form';
import { ShoppingLinePanel } from './shopping-line-panel';
import { ShoppingRows } from './shopping-list';
import { useLineFiles } from '@/lib/use-line-files';
import { ListPlaceholder } from '@/components/placeholder';
import { LoadError } from '@/components/load-error';

/** A room's "What we're buying" (M3, OD-52): its shopping lines, and adding one for this room. */
export function RoomShopping({ roomId, roomName }: { roomId: string; roomName: string }) {
  const trpc = useTRPC();
  const { canEdit } = useMe();
  const lines = useQuery(trpc.shoppingLines.list.queryOptions({ roomId }));
  const invalidate = useRefreshShopping();
  const [adding, setAdding] = useState(false);
  const files = useLineFiles(lines.data);
  const [openId, setOpenId] = useState<string | null>(null);
  useReturnFocus(adding ? `add-line-${roomId}` : null);
  useReturnFocus(openId);
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
      {lines.isPending ? (
        <ListPlaceholder label="Loading the list" rows={3} surface={false} className="-mt-4" />
      ) : null}
      {lines.error ? (
        <LoadError what={`the list for ${roomName}`} error={lines.error} retry={[lines]} />
      ) : null}
      {lines.data && lines.data.length === 0 ? (
        <p className="text-muted-foreground">Nothing on the list for {roomName} yet.</p>
      ) : null}
      {lines.data && lines.data.length > 0 ? (
        <ShoppingRows
          lines={lines.data}
          files={files.data ?? []}
          canEdit={canEdit}
          onOpen={(l) => setOpenId(l.id)}
          className="-mt-4"
        />
      ) : null}
      <EditPanel
        open={adding}
        title={`Something for the ${roomName}`}
        onClose={() => {
          create.reset();
          setAdding(false);
        }}
      >
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
      </EditPanel>
      {
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdding(true)}
              data-return-focus={`add-line-${roomId}`}
            >
              <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
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
      }
      <ShoppingLinePanel
        line={lines.data?.find((l) => l.id === openId)}
        files={files.data ?? []}
        canEdit={canEdit}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}
