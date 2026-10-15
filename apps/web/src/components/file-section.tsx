import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { FileGrid } from '@/components/file-grid';
import { FileUpload } from '@/components/file-upload';
import { PictureViewer } from '@/components/picture-viewer';
import { PlanGrid } from '@/components/plan-grid';
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
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const Heading = headingLevel;
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.files.pathKey() }),
      onChanged?.(),
    ]);
  };

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <div>
        <Heading id={`${id}-title`} className={headingLevel === 'h2' ? 'text-2xl' : 'text-xl'}>
          {title}
        </Heading>
        {description ? <p className="mt-1 text-muted-foreground">{description}</p> : null}
      </div>
      {files.length > 0 ? (
        <FileGrid
          files={files}
          label={title}
          onOpen={setOpen}
          canEdit={canEdit}
          badge={badge}
          className={gridClassName}
        />
      ) : (
        <PlanGrid className="h-32 rounded-xl">{emptyText}</PlanGrid>
      )}
      {canEdit && target && uploadLabel ? (
        <div className="flex flex-col gap-3">
          {beforeUpload}
          <FileUpload target={target} label={uploadLabel} onUploaded={refresh} />
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
