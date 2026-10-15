import { fileUpdateSchema, formatIsoDate, isIsoDate, today } from '@reparo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { FileSection } from '@/components/file-section';
import { FormError, Select } from '@/components/form';
import { Button } from '@/components/ui/button';
import { trpcClient, useTRPC } from '@/lib/trpc';
import { problemWith } from '@/lib/problem';
import { AutoSaveField } from '@/components/auto-save-field';
import { SaveState } from '@/components/save-state';
import type { FileView } from '@/lib/upload';
import { GridPlaceholder } from '@/components/placeholder';

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
  const queryClient = useQueryClient();
  const files = useQuery(trpc.files.list.queryOptions({ ownerType: 'room', ownerId: roomId }));
  const roomJobs = useQuery(trpc.jobs.forRoom.queryOptions({ roomId }));
  const [progressJob, setProgressJob] = useState('');
  const jobPickId = useId();
  const refreshCovers = () =>
    queryClient.invalidateQueries({ queryKey: trpc.files.roomCovers.queryKey() });
  const setCover = useMutation(
    trpc.rooms.setCover.mutationOptions({
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.files.pathKey() }),
          refreshCovers(),
        ]),
    }),
  );

  if (files.isPending) return <GridPlaceholder label="Loading pictures" />;
  if (files.error) return <p role="alert">Couldn&apos;t load pictures: {files.error.message}</p>;

  const all = files.data;
  const of = (kind: FileView['kind']) => all.filter((f) => f.kind === kind);
  const jobs: RoomJob[] = (roomJobs.data ?? []).map((jr) => jr.job);

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
        onChanged={refreshCovers}
        badge={(f) =>
          f.isCover ? (
            <span className="rounded-lg bg-card px-2 py-0.5 text-sm font-semibold text-foreground shadow-sm">
              Cover
            </span>
          ) : null
        }
        actions={(f) =>
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
        }
      />
      {setCover.error ? <FormError>{setCover.error.message}</FormError> : null}

      <FileSection
        id="inspiration"
        title="Inspiration"
        description="Pictures of things we like, from anywhere."
        files={of('inspiration')}
        target={() => ({ ownerType: 'room', ownerId: roomId, kind: 'inspiration' })}
        uploadLabel="Add inspiration"
        emptyText="Nothing saved yet"
        canEdit={canEdit}
      />

      <FileSection
        id="progress"
        title="Progress"
        description="Photos of the work as it happens, newest first."
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
              <label htmlFor={jobPickId} className="block text-sm font-semibold">
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
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const saveFile = (input: { takenOn?: string; jobId?: string | null }) =>
    trpcClient.files.update
      .mutate({ id: file.id, ...input })
      .then(() => queryClient.invalidateQueries({ queryKey: trpc.files.pathKey() }));
  const job = useMutation({ mutationFn: (jobId: string) => saveFile({ jobId: jobId || null }) });
  if (!canEdit) {
    return (
      <p>
        {file.takenOn && isIsoDate(file.takenOn) ? `Taken ${formatIsoDate(file.takenOn)}` : null}
        {file.jobName ? `, showing ${file.jobName}` : null}
      </p>
    );
  }
  const shownJob = (job.isPending ? job.variables : undefined) ?? file.jobId ?? '';
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
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
      <div className="min-w-0 flex-1 basis-48">
        <label htmlFor={`job-${file.id}`} className="block text-sm font-semibold">
          Shows the job
        </label>
        <Select
          id={`job-${file.id}`}
          className="mt-1.5"
          value={shownJob}
          disabled={job.isPending}
          onChange={(e) => job.mutate(e.target.value)}
        >
          <option value="">No particular job</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </Select>
        <SaveState
          className="mt-1"
          mutation={job}
          what="Job the photo shows"
          onRetry={() => job.mutate(job.variables ?? shownJob)}
        />
      </div>
    </div>
  );
}
