import { useMutation } from '@tanstack/react-query';
import { ExternalLink, FileText, Image } from 'lucide-react';
import { ConfirmRemove } from '@/components/confirm-remove';
import { FileUpload } from '@/components/file-upload';
import { FormError } from '@/components/form';
import { Button } from '@/components/ui/button';
import { useTRPC } from '@/lib/trpc';
import type { FileView, UploadTarget } from '@/lib/upload';
import { useRefreshFiles } from '@/lib/refresh';

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
  loading = false,
  onRetry,
}: {
  files: FileView[];
  target: UploadTarget;
  /** "Attach a receipt". */
  addLabel: string;
  canEdit: boolean;
  /** Read out when removing: "receipt". */
  what: string;
  /** The files are still on their way (OD-145): says so, rather than offering only Attach. */
  loading?: boolean;
  /** They couldn't load: says so, with Try again (OD-145). */
  onRetry?: (() => void) | undefined;
}) {
  const trpc = useTRPC();
  const refresh = useRefreshFiles();
  const remove = useMutation(trpc.files.remove.mutationOptions({ onSuccess: refresh }));
  if (loading) {
    return (
      <p role="status" className="flex min-h-11 items-center text-sm text-muted-foreground">
        Loading files…
      </p>
    );
  }
  if (onRetry) {
    return (
      <p role="alert" className="flex min-h-11 flex-wrap items-center gap-x-2 text-sm">
        Couldn&apos;t load the files.
        <Button type="button" variant="link" className="px-0" onClick={onRetry}>
          Try again
        </Button>
      </p>
    );
  }
  if (files.length === 0 && !canEdit) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      {files.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-x-2">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-1">
              <a
                href={f.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 min-w-0 items-center gap-2 text-sm underline underline-offset-4"
              >
                {f.isPicture ? (
                  <Image
                    aria-hidden
                    absoluteStrokeWidth
                    strokeWidth={1.5}
                    className="size-4 shrink-0"
                  />
                ) : (
                  <FileText
                    aria-hidden
                    absoluteStrokeWidth
                    strokeWidth={1.5}
                    className="size-4 shrink-0"
                  />
                )}
                <span className="truncate">{f.caption || f.originalName}</span>
                {f.url ? (
                  <>
                    <ExternalLink
                      aria-hidden
                      absoluteStrokeWidth
                      strokeWidth={1.5}
                      className="size-4 shrink-0"
                    />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">(missing)</span>
                )}
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
          className={files.length > 0 ? '' : '-ml-3'}
          target={() => target}
          label={addLabel}
          onUploaded={refresh}
        />
      ) : null}
      {remove.error ? <FormError className="w-full">{remove.error.message}</FormError> : null}
    </div>
  );
}
