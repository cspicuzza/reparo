import { formatIsoDate, isIsoDate } from '@reparo/shared';
import { ExternalLink, FileText, ImageOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { formatSize, type FileView } from '@/lib/upload';
import { cn } from '@/lib/utils';

/**
 * Files as tiles (M4, OD-56). Pictures are buttons that open the viewer; PDFs are links that
 * open in a new tab, in the browser's own viewer (Q24). Pictures load as they scroll into view
 * (originals only, Q7). A file storage no longer has shows as missing rather than a broken
 * image.
 */
export function FileGrid({
  files,
  onOpen,
  canEdit = false,
  badge,
  label,
  className,
}: {
  files: FileView[];
  /** Open the viewer on a picture, by its index among the pictures. */
  /** Open the viewer on a file, by its index in `files`. PDFs open there only for details. */
  onOpen: (index: number) => void;
  /** Show a "Caption or remove" button under PDFs (editors), since a PDF opens in a new tab. */
  canEdit?: boolean;
  /** A short tag on a tile ("Cover"), drawn as a chip with words. */
  badge?: ((file: FileView) => ReactNode) | undefined;
  /** The list's accessible name. */
  label: string;
  className?: string | undefined;
}) {
  return (
    <ul
      aria-label={label}
      className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)}
    >
      {files.map((f) => {
        const chip = badge?.(f);
        // A picture with no caption is named by its place, not its file name ("I027.png")
        // (OD-143); a document keeps its file name, which is how people know it.
        const caption =
          f.caption || (f.isPicture ? `picture ${files.indexOf(f) + 1}` : f.originalName);
        return (
          <li key={f.id} className="min-w-0">
            {f.isPicture ? (
              <button
                type="button"
                onClick={() => onOpen(files.indexOf(f))}
                className="group block w-full rounded-lg text-left"
                aria-label={`Open ${caption}`}
              >
                <span className="relative block aspect-[4/3] overflow-hidden rounded-lg border border-border bg-inset">
                  {f.url ? (
                    <img
                      // The small JPEG when there is one; the original before thumbnails (Q136).
                      src={f.thumbUrl ?? f.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover transition-opacity group-hover:opacity-90"
                    />
                  ) : (
                    <Missing />
                  )}
                  {chip ? <span className="absolute top-2 left-2">{chip}</span> : null}
                </span>
                <Caption file={f} />
              </button>
            ) : (
              <a
                href={f.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={f.url ? undefined : true}
                className="group block rounded-lg"
              >
                <span className="relative flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-lg border border-border bg-inset p-3 text-center">
                  {chip ? <span className="absolute top-2 left-2">{chip}</span> : null}
                  {f.url ? (
                    <>
                      <FileText aria-hidden className="size-8 text-muted-foreground" />
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 group-hover:underline">
                        Open PDF
                        <ExternalLink aria-hidden className="size-4 shrink-0" />
                        <span className="sr-only"> (opens in a new tab)</span>
                      </span>
                    </>
                  ) : (
                    <Missing />
                  )}
                </span>
                <Caption file={f} />
              </a>
            )}
            {!f.isPicture && canEdit ? (
              <Button
                type="button"
                variant="ghost"
                className="-ml-3"
                onClick={() => onOpen(files.indexOf(f))}
              >
                Caption or remove
                <span className="sr-only"> {f.caption || f.originalName}</span>
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function Caption({ file }: { file: FileView }) {
  return (
    <span className="mt-1.5 block text-sm">
      {file.caption || !file.isPicture ? (
        <span className="block truncate font-semibold">{file.caption || file.originalName}</span>
      ) : null}
      <span className="block truncate text-muted-foreground">
        {file.takenOn && isIsoDate(file.takenOn)
          ? `${formatIsoDate(file.takenOn)}${file.jobName ? `, ${file.jobName}` : ''}`
          : null}
        {!file.takenOn && !file.isPicture ? formatSize(file.sizeBytes) : null}
      </span>
    </span>
  );
}

function Missing() {
  return (
    <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-sm text-muted-foreground">
      <ImageOff aria-hidden className="size-6" />
      Missing from storage
    </span>
  );
}
