import { fileUpdateSchema, formatIsoDate, isIsoDate, today } from '@reparo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { FileSection } from '@/components/file-section';
import { FileUpload } from '@/components/file-upload';
import { FormError, Select, labelClass } from '@/components/form';
import { Button } from '@/components/ui/button';
import { trpcClient, useTRPC } from '@/lib/trpc';
import { problemWith } from '@/lib/problem';
import { AutoSaveField } from '@/components/auto-save-field';
import type { FileView } from '@/lib/upload';
import { GridPlaceholder } from '@/components/placeholder';
import { LoadError } from '@/components/load-error';
import { useRefreshFiles } from '@/lib/refresh';
import { AutoSaveSelect } from '@/components/auto-save-select';

type RoomJob = { id: string; name: string };

/**
 * A room's pictures (M4, OD-57; Q16–Q18, Q25): Renderings (one is the cover), Inspiration, and
 * Progress (dated, optionally showing one of the jobs in this room).
 */
export function RoomPictures({
  roomId,
  roomName,
  canEdit,
}: {
  roomId: string;
  roomName: string;
  canEdit: boolean;
}) {
  const trpc = useTRPC();
  const files = useQuery(trpc.files.list.queryOptions({ ownerType: 'room', ownerId: roomId }));
  const roomJobs = useQuery(trpc.jobs.forRoom.queryOptions({ roomId }));
  const [progressJob, setProgressJob] = useState('');
  const jobPickId = useId();
  // Every file list, the room covers among them (OD-145).
  const refreshFiles = useRefreshFiles();
  const setCover = useMutation(trpc.rooms.setCover.mutationOptions({ onSuccess: refreshFiles }));

  if (files.isPending) return <GridPlaceholder label="Loading pictures" />;
  if (files.error) return <LoadError what="the pictures" error={files.error} retry={[files]} />;

  const all = files.data;
  const of = (kind: FileView['kind']) => all.filter((f) => f.kind === kind);
  const jobs: RoomJob[] = (roomJobs.data ?? []).map((jr) => jr.job);

  // With no pictures at all, one row instead of three empty sections (OD-117, Q140).
  if (all.length === 0) {
    return canEdit ? (
      <FirstPictures roomId={roomId} onUploaded={refreshFiles} />
    ) : (
      <p className="text-muted-foreground">No pictures of the {roomName} yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <FileSection
        id="renderings"
        title="Renderings"
        description={`What the ${roomName} will look like when it's done.`}
        files={of('rendering')}
        target={() => ({ ownerType: 'room', ownerId: roomId, kind: 'rendering' })}
        uploadLabel="Add renderings"
        emptyText="No renderings yet"
        canEdit={canEdit}
        badge={(f) =>
          f.isCover ? (
            <span className="rounded-lg bg-card px-2 py-0.5 text-sm font-semibold text-foreground shadow-knob">
              Cover
            </span>
          ) : null
        }
        // The cover's buttons and their error both sit in the picture viewer, where they were
        // pressed (OD-145).
        actions={(f) => (
          <>
            f.isCover ? (
            <Button
              type="button"
              variant="ghost"
              disabled={setCover.isPending}
              onClick={() => setCover.mutate({ roomId, fileId: null })}
            >
              Stop using as the cover
            </Button>
            ) : (
            <Button
              type="button"
              variant="outline"
              className="ml-3"
              disabled={setCover.isPending}
              onClick={() => setCover.mutate({ roomId, fileId: f.id })}
            >
              Make this the cover
            </Button>
            )
            {setCover.error && setCover.variables?.fileId !== undefined ? (
              <FormError className="w-full">{setCover.error.message}</FormError>
            ) : null}
          </>
        )}
      />

      <FileSection
        id="inspiration"
        title="Inspiration"
        files={of('inspiration')}
        target={() => ({ ownerType: 'room', ownerId: roomId, kind: 'inspiration' })}
        uploadLabel="Add inspiration"
        emptyText="Nothing saved yet"
        canEdit={canEdit}
      />

      <FileSection
        id="progress"
        title="Progress"
        description="Newest first."
        files={of('progress_photo')}
        target={() => ({
          ownerType: 'room',
          ownerId: roomId,
          kind: 'progress_photo',
          takenOn: today(),
          jobId: progressJob || null,
        })}
        uploadLabel="Add progress photos"
        emptyText="No progress photos yet"
        canEdit={canEdit}
        beforeUpload={
          jobs.length > 0 ? (
            <div className="sm:max-w-sm">
              <label htmlFor={jobPickId} className={labelClass}>
                Which job do the new photos show?
              </label>
              <Select
                id={jobPickId}
                className="mt-1.5"
                value={progressJob}
                onChange={(e) => setProgressJob(e.target.value)}
              >
                <option value="">No particular job</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null
        }
        details={(f) => <ProgressDetails key={f.id} file={f} jobs={jobs} canEdit={canEdit} />}
      />
    </div>
  );
}

/**
 * A progress photo's date and job, changeable by editors (Q17). Each saves on its own when it
 * changes, with no Save button (Workflow polish, OD-77).
 */
function ProgressDetails({
  file,
  jobs,
  canEdit,
}: {
  file: FileView;
  jobs: RoomJob[];
  canEdit: boolean;
}) {
  const refreshFiles = useRefreshFiles();
  const saveFile = (input: { takenOn?: string; jobId?: string | null }) =>
    trpcClient.files.update.mutate({ id: file.id, ...input }).then(refreshFiles);
  if (!canEdit) {
    return (
      <p>
        {file.takenOn && isIsoDate(file.takenOn) ? `Taken ${formatIsoDate(file.takenOn)}` : null}
        {file.jobName ? `, showing ${file.jobName}` : null}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="w-48">
        <AutoSaveField
          id={`taken-${file.id}`}
          label="Taken on"
          type="date"
          initial={file.takenOn ?? ''}
          what="Date the photo was taken"
          validate={(v) => problemWith(fileUpdateSchema.shape.takenOn, v)}
          onSave={(v) => saveFile({ takenOn: v })}
        />
      </div>
      <AutoSaveSelect
        id={`job-${file.id}`}
        label="Shows the job"
        value={file.jobId ?? ''}
        options={[
          { value: '', label: 'No particular job' },
          ...jobs.map((j) => ({ value: j.id, label: j.name })),
        ]}
        what="Job the photo shows"
        onSave={(jobId) => saveFile({ jobId: jobId || null })}
      />
    </div>
  );
}

type FirstKind = 'rendering' | 'inspiration' | 'progress_photo';

/**
 * A room's first pictures (OD-117, Q140): what kind they are, and one upload box. Once there
 * are pictures, each kind gets its own section.
 */
function FirstPictures({
  roomId,
  onUploaded,
}: {
  roomId: string;
  onUploaded: () => Promise<unknown>;
}) {
  const [kind, setKind] = useState<FirstKind>('rendering');
  const kindId = useId();
  return (
    <div className="flex flex-col gap-3">
      <div className="sm:max-w-xs">
        <label htmlFor={kindId} className={labelClass}>
          The new pictures are
        </label>
        <Select
          id={kindId}
          className="mt-1.5"
          value={kind}
          onChange={(e) => setKind(e.target.value as FirstKind)}
        >
          <option value="rendering">Renderings: how it will look</option>
          <option value="inspiration">Inspiration: things we like</option>
          <option value="progress_photo">Progress photos: the work as it happens</option>
        </Select>
      </div>
      <FileUpload
        target={() => ({
          ownerType: 'room',
          ownerId: roomId,
          kind,
          ...(kind === 'progress_photo' ? { takenOn: today(), jobId: null } : {}),
        })}
        label="Add pictures"
        note="No pictures yet"
        onUploaded={async () => {
          await onUploaded();
        }}
      />
    </div>
  );
}
