import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { FileGrid } from '@/components/file-grid';
import { FileUpload } from '@/components/file-upload';
import { LoadError } from '@/components/load-error';
import { PictureViewer } from '@/components/picture-viewer';
import { Loading } from '@/components/placeholder';
import { PlanGrid } from '@/components/plan-grid';
import type { QuerySource } from '@/lib/load-problem';
import { useTRPC } from '@/lib/trpc';
import type { FileView, UploadTarget } from '@/lib/upload';

/**
 * One group of files on a page (M4, OD-56): a heading, the files as tiles, the viewer, and for
 * editors the upload box. Rooms, jobs, shopping lines, payments, vendors and estimates all use
 * it; each passes its own files (from one `files.list` query per owner) and words.
 */
export function FileSection({
  id,
  title,
  description,
  files,
  target,
  uploadLabel,
  emptyText,
  canEdit,
  headingLevel = 'h3',
  badge,
  details,
  actions,
  beforeUpload,
  onChanged,
  gridClassName,
  source,
  emptyLine = false,
  emptyUploads,
}: {
  /** Used for the heading's id. */
  id: string;
  title: string;
  description?: string;
  files: FileView[];
  /** Where an upload goes; omit for a read-only section (e.g. photos added on another page). */
  target?: () => UploadTarget;
  uploadLabel?: string;
  emptyText: string;
  canEdit: boolean;
  headingLevel?: 'h2' | 'h3';
  badge?: ((file: FileView) => ReactNode) | undefined;
  details?: ((file: FileView) => ReactNode) | undefined;
  actions?: ((file: FileView) => ReactNode) | undefined;
  /** Controls shown next to the upload box (a progress photo's job). */
  beforeUpload?: ReactNode;
  /** Extra queries to refresh after a change (a room's cover on the Rooms list). */
  onChanged?: () => Promise<unknown>;
  /** Columns for the tiles where the window's width is the wrong guide (inside a side panel). */
  gridClassName?: string | undefined;
  /**
   * The query the files came from, so the section shows loading and load errors honestly
   * instead of "No … yet" (OD-110, Q122). Omit when the page already handled them.
   */
  source?: QuerySource | undefined;
  /**
   * With nothing here, the section is one line: its heading, "Not added yet" and its Add
   * buttons, instead of a description and a drop box (OD-120, Q148).
   */
  emptyLine?: boolean;
  /** The buttons on that line, when one upload box isn't enough (drawings by kind). */
  emptyUploads?: { label: string; target: () => UploadTarget }[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const Heading = headingLevel;
  const uploading = canEdit && target !== undefined && uploadLabel !== undefined;
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.files.pathKey() }),
      onChanged?.(),
    ]);
  };

  if (emptyLine && files.length === 0 && !source?.isPending && !source?.error) {
    const buttons =
      emptyUploads ??
      (uploadLabel !== undefined && target !== undefined ? [{ label: uploadLabel, target }] : []);
    return (
      <section
        aria-labelledby={`${id}-title`}
        className="flex flex-wrap items-center gap-x-4 gap-y-2"
      >
        <Heading id={`${id}-title`} className={headingLevel === 'h2' ? 'text-2xl' : 'text-xl'}>
          {title}
        </Heading>
        <span className="text-muted-foreground">
          {canEdit && target !== undefined ? 'Not added yet' : emptyText}
        </span>
        {canEdit
          ? buttons.map((b) => (
              <FileUpload
                key={b.label}
                compact
                variant="outline"
                target={b.target}
                label={b.label}
                onUploaded={refresh}
              />
            ))
          : null}
      </section>
    );
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <div>
        <Heading id={`${id}-title`} className={headingLevel === 'h2' ? 'text-2xl' : 'text-xl'}>
          {title}
        </Heading>
        {description ? <p className="mt-1 text-muted-foreground">{description}</p> : null}
      </div>
      {/* With nothing here yet, an editor gets just the upload box, which says so, rather than
          an empty grid above a separate box (OD-95). */}
      {source?.isPending ? (
        <Loading label={`Loading ${title.toLowerCase()}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <div className="aspect-[4/3] rounded-lg bg-inset" />
            <div className="aspect-[4/3] rounded-lg bg-inset" />
          </div>
        </Loading>
      ) : source?.error ? (
        <LoadError what={title.toLowerCase()} error={source.error} retry={[source]} />
      ) : files.length > 0 ? (
        <FileGrid
          files={files}
          label={title}
          onOpen={setOpen}
          canEdit={canEdit}
          badge={badge}
          className={gridClassName}
        />
      ) : uploading ? null : (
        <PlanGrid className="h-32 rounded-xl">{emptyText}</PlanGrid>
      )}
      {uploading && !source?.isPending && !source?.error ? (
        <div className="flex flex-col gap-3">
          {beforeUpload}
          <FileUpload
            target={target}
            label={uploadLabel}
            note={files.length === 0 ? emptyText : undefined}
            onUploaded={refresh}
          />
        </div>
      ) : null}
      <PictureViewer
        pictures={files}
        index={open}
        onIndexChange={setOpen}
        canEdit={canEdit}
        onChanged={refresh}
        details={details}
        actions={actions}
      />
    </section>
  );
}
