import { Upload, X } from 'lucide-react';
import { useId, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { FormError } from '@/components/form';
import { Button } from '@/components/ui/button';
import { acceptFor, uploadFile, type FileView, type UploadTarget } from '@/lib/upload';
import { cn } from '@/lib/utils';

type InFlight = { key: string; name: string; progress: number; error: string | null };

/**
 * Adding files (M4, OD-56; Q9). On a phone the button opens the phone's own camera or library
 * menu. On a laptop the same button works, files can be dropped on the box, and a copied
 * picture can be pasted into it (select the box, then paste). Each file shows its progress;
 * a refused one says why in plain words and can be dismissed.
 */
export function FileUpload({
  target,
  label,
  onUploaded,
  compact = false,
  variant = compact ? 'ghost' : 'outline',
  note,
  className,
}: {
  /** Where the files go. Read when each upload starts, so a job picked just before counts. */
  target: () => UploadTarget;
  /** "Add renderings", "Add a receipt". */
  label: string;
  onUploaded: (file: FileView) => void | Promise<void>;
  /** Just the button, for a row (a payment's receipt): no drop box or paste hint. */
  compact?: boolean;
  /** The button's look; ghost in a row, outline where it's the only thing said (OD-120). */
  variant?: 'ghost' | 'outline';
  /** Said first inside the box, e.g. that nothing is here yet (OD-95). */
  note?: string | undefined;
  className?: string;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<InFlight[]>([]);
  const kind = target().kind;

  const patch = (key: string, change: Partial<InFlight>) =>
    setUploads((all) => all.map((u) => (u.key === key ? { ...u, ...change } : u)));

  const send = (files: readonly File[]) => {
    for (const file of files) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setUploads((all) => [
        ...all,
        { key, name: file.name || 'Pasted picture', progress: 0, error: null },
      ]);
      uploadFile(file, target(), (p) => patch(key, { progress: p }))
        .then(async (made) => {
          await onUploaded(made);
          setUploads((all) => all.filter((u) => u.key !== key));
        })
        .catch((e: unknown) =>
          patch(key, { error: e instanceof Error ? e.message : 'The upload didn’t go through' }),
        );
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    send(Array.from(e.dataTransfer.files));
  };
  const onPaste = (e: ClipboardEvent) => {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length === 0) return;
    e.preventDefault();
    send(pasted);
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        role="group"
        aria-label={label}
        // Focusable so a copied picture can be pasted into it.
        tabIndex={compact ? undefined : 0}
        onPaste={onPaste}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl',
          !compact && 'border border-dashed border-input p-3',
          dragging && 'border-solid border-foreground bg-inset',
        )}
      >
        <input
          ref={input}
          id={inputId}
          type="file"
          multiple
          accept={acceptFor(kind)}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            send(Array.from(e.currentTarget.files ?? []));
            e.currentTarget.value = '';
          }}
        />
        <Button type="button" variant={variant} onClick={() => input.current?.click()}>
          <Upload aria-hidden className="size-4" />
          {label}
        </Button>
        {note && !compact ? <p className="text-sm text-muted-foreground">{note}</p> : null}
        {compact ? null : (
          <p className="hidden text-sm text-muted-foreground sm:block">
            Or drop files here. To paste a copied picture, click this box and paste.
          </p>
        )}
      </div>

      {uploads.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Uploads">
          {uploads.map((u) => (
            <li key={u.key} className="text-sm">
              {u.error ? (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <FormError className="mt-0">
                    {u.name}: {u.error}
                  </FormError>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setUploads((all) => all.filter((x) => x.key !== u.key))}
                  >
                    <X aria-hidden className="size-4" />
                    Dismiss
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  <span
                    role="progressbar"
                    aria-label={`Uploading ${u.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(u.progress * 100)}
                    className="h-2 w-28 shrink-0 overflow-hidden rounded-full bg-inset"
                  >
                    <span
                      className="block h-full bg-foreground transition-[width]"
                      style={{ width: `${Math.round(u.progress * 100)}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                    {Math.round(u.progress * 100)}%
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
