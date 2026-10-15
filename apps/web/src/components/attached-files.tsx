import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Image } from 'lucide-react';
import { ConfirmRemove } from '@/components/confirm-remove';
import { FileUpload } from '@/components/file-upload';
import { FormError } from '@/components/form';
import { useTRPC } from '@/lib/trpc';
import type { FileView, UploadTarget } from '@/lib/upload';

/**
 * Files attached to one row, such as a payment's receipt or a shopping line's receipts
 * (M4, OD-58/59). Each opens in a new tab; editors attach more and remove them in place.
 */
export function AttachedFiles({
  files,
  target,
  addLabel,
  canEdit,
  what,
}: {
  files: FileView[];
  target: UploadTarget;
  /** "Attach a receipt". */
  addLabel: string;
  canEdit: boolean;
  /** Read out when removing: "receipt". */
  what: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.files.pathKey() });
  const remove = useMutation(trpc.files.remove.mutationOptions({ onSuccess: refresh }));
  if (files.length === 0 && !canEdit) return null;
  return (
    <div className="flex flex-col gap-1">
      {files.length > 0 ? (
        <ul className="flex flex-col">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-1">
              <a
                href={f.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 min-w-0 items-center gap-2 text-sm underline underline-offset-4"
              >
                {f.isPicture ? (
                  <Image aria-hidden className="size-4 shrink-0" />
                ) : (
                  <FileText aria-hidden className="size-4 shrink-0" />
                )}
                <span className="truncate">{f.caption || f.originalName}</span>
                {f.url ? null : <span className="text-muted-foreground">(missing)</span>}
              </a>
              {canEdit ? (
                <ConfirmRemove
                  what={`the ${what} ${f.caption || f.originalName}`}
                  disabled={remove.isPending}
                  onConfirm={() => remove.mutate({ id: f.id })}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit ? (
        <FileUpload
          compact
          className="-ml-3"
          target={() => target}
          label={addLabel}
          onUploaded={refresh}
        />
      ) : null}
      {remove.error ? <FormError>{remove.error.message}</FormError> : null}
    </div>
  );
}
