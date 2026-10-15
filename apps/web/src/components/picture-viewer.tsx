import { Dialog } from '@base-ui/react/dialog';
import { useMutation } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FileText, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { AutoSaveField } from '@/components/auto-save-field';
import { ConfirmRemove } from '@/components/confirm-remove';
import { problemWith } from '@/lib/problem';
import { fileUpdateSchema } from '@reparo/shared';
import { FormError } from '@/components/form';
import { Button, buttonVariants } from '@/components/ui/button';
import { useTRPC } from '@/lib/trpc';
import { formatSize, type FileView } from '@/lib/upload';

/**
 * A picture full size (M4, OD-56; Q24). A PDF shows a button that opens it in a new tab, so
 * its caption can be changed and it can be removed here too. Previous and Next buttons, the arrow keys, and a swipe
 * on a phone move between pictures. Built on Base UI's Dialog, which traps focus, closes on
 * Escape and hands focus back to the picture that opened it. Editors change the caption and
 * remove the picture here; screens can add their own details and actions (a progress photo's
 * date and job, "Make this the cover").
 */
export function PictureViewer({
  pictures,
  index,
  onIndexChange,
  canEdit,
  onChanged,
  details,
  actions,
}: {
  pictures: FileView[];
  /** The picture shown, or null when closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  canEdit: boolean;
  onChanged: () => Promise<unknown>;
  details?: ((picture: FileView) => ReactNode) | undefined;
  actions?: ((picture: FileView) => ReactNode) | undefined;
}) {
  const open = index !== null && pictures[index] !== undefined;
  const picture = open ? pictures[index] : undefined;
  const count = pictures.length;
  const go = (step: number) => {
    if (index === null || count === 0) return;
    onIndexChange((index + step + count) % count);
  };

  // Arrow keys anywhere while it's open (not only when focus is inside: a button that was
  // just used may have been replaced, e.g. "Make this the cover"). Not while typing.
  useEffect(() => {
    if (index === null || count === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el?.closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') onIndexChange((index - 1 + count) % count);
      if (e.key === 'ArrowRight') onIndexChange((index + 1) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count, onIndexChange]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? null : onIndexChange(null))}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-scrim transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed inset-0 z-50 flex flex-col bg-popover text-base text-popover-foreground shadow-lg outline-none transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 sm:inset-6 sm:rounded-xl sm:border sm:border-border">
          {picture && index !== null ? (
            <ViewerBody
              key={picture.id}
              picture={picture}
              position={`${index + 1} of ${count}`}
              canMove={count > 1}
              go={go}
              canEdit={canEdit}
              onChanged={onChanged}
              onRemoved={() => onIndexChange(count > 1 ? Math.min(index, count - 2) : null)}
              details={details}
              actions={actions}
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ViewerBody({
  picture,
  position,
  canMove,
  go,
  canEdit,
  onChanged,
  onRemoved,
  details,
  actions,
}: {
  picture: FileView;
  position: string;
  canMove: boolean;
  go: (step: number) => void;
  canEdit: boolean;
  onChanged: () => Promise<unknown>;
  onRemoved: () => void;
  details: ((picture: FileView) => ReactNode) | undefined;
  actions: ((picture: FileView) => ReactNode) | undefined;
}) {
  const trpc = useTRPC();
  const update = useMutation(trpc.files.update.mutationOptions({ onSuccess: onChanged }));
  const remove = useMutation(
    trpc.files.remove.mutationOptions({
      onSuccess: async () => {
        onRemoved();
        await onChanged();
      },
    }),
  );
  const swipeFrom = useRef<number | null>(null);

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0">
          <Dialog.Title className="truncate text-xl">
            {picture.caption || picture.originalName}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">
            {position}
          </Dialog.Description>
        </div>
        <Dialog.Close className={buttonVariants({ variant: 'ghost', className: '-mr-2' })}>
          <X aria-hidden className="size-5" />
          Close
        </Dialog.Close>
      </div>

      <div
        className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center bg-inset p-2"
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') swipeFrom.current = e.clientX;
        }}
        onPointerUp={(e) => {
          const from = swipeFrom.current;
          swipeFrom.current = null;
          if (from === null || !canMove) return;
          const dx = e.clientX - from;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        {!picture.isPicture ? (
          picture.url ? (
            <a
              href={picture.url}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: 'outline' })}
            >
              <FileText aria-hidden className="size-4" />
              Open the PDF
            </a>
          ) : (
            <p className="text-muted-foreground">This file is missing from storage.</p>
          )
        ) : picture.url ? (
          <img
            src={picture.url}
            alt={picture.caption || picture.originalName}
            className="max-h-full max-w-full rounded-lg object-contain"
            draggable={false}
          />
        ) : (
          <p className="text-muted-foreground">This picture is missing from storage.</p>
        )}
      </div>

      <div className="flex max-h-[45%] flex-col gap-3 overflow-y-auto overscroll-contain border-t border-border px-4 py-3">
        {canMove ? (
          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => go(-1)}>
              <ChevronLeft aria-hidden className="size-4" />
              Previous
            </Button>
            <Button type="button" variant="outline" onClick={() => go(1)}>
              Next
              <ChevronRight aria-hidden className="size-4" />
            </Button>
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {picture.originalName}, {formatSize(picture.sizeBytes)}
        </p>
        {details?.(picture)}
        {canEdit ? (
          <AutoSaveField
            id={`caption-${picture.id}`}
            label="Caption"
            initial={picture.caption}
            what={`Caption of ${picture.caption || picture.originalName}`}
            validate={(v) => problemWith(fileUpdateSchema.shape.caption, v)}
            onSave={(v) => update.mutateAsync({ id: picture.id, caption: v })}
          />
        ) : null}
        {canEdit ? (
          <div className="-ml-3 flex flex-wrap items-center gap-1">
            {actions?.(picture)}
            <ConfirmRemove
              what={picture.caption || picture.originalName}
              disabled={remove.isPending}
              onConfirm={() => remove.mutate({ id: picture.id })}
            />
          </div>
        ) : null}
        {remove.error ? <FormError>{remove.error.message}</FormError> : null}
      </div>
    </>
  );
}
