import { formatIsoDate, isIsoDate, today } from '@reparo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { FileSection } from '@/components/file-section';
import { FormError, Input, Select } from '@/components/form';
import { Button } from '@/components/ui/button';
import { useTRPC } from '@/lib/trpc';
import type { FileView } from '@/lib/upload';

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
          queryClient.invalidateQueries({ queryKey: trpc.files.list.queryKey() }),
          refreshCovers(),
        ]),
    }),
  );

  if (files.isPending) return <p className="text-muted-foreground">Loading pictures…</p>;
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

/** A progress photo's date and job, changeable by editors (Q17). */
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
  const [takenOn, setTakenOn] = useState(file.takenOn ?? '');
  const [jobId, setJobId] = useState(file.jobId ?? '');
  const update = useMutation(
    trpc.files.update.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.files.list.queryKey() }),
    }),
  );
  if (!canEdit) {
    return (
      <p>
        {file.takenOn && isIsoDate(file.takenOn) ? `Taken ${formatIsoDate(file.takenOn)}` : null}
        {file.jobName ? `, showing ${file.jobName}` : null}
      </p>
    );
  }
  const changed = takenOn !== (file.takenOn ?? '') || jobId !== (file.jobId ?? '');
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isIsoDate(takenOn)) return;
        update.mutate({ id: file.id, takenOn, jobId: jobId || null });
      }}
    >
      <div>
        <label htmlFor={`taken-${file.id}`} className="block text-sm font-semibold">
          Taken on
        </label>
        <Input
          id={`taken-${file.id}`}
          type="date"
          className="mt-1.5"
          value={takenOn}
          onChange={(e) => setTakenOn(e.target.value)}
        />
      </div>
      <div className="min-w-0 flex-1 basis-48">
        <label htmlFor={`job-${file.id}`} className="block text-sm font-semibold">
          Shows the job
        </label>
        <Select
          id={`job-${file.id}`}
          className="mt-1.5"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
        >
          <option value="">No particular job</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </Select>
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={update.isPending || !changed || !isIsoDate(takenOn)}
      >
        Save date and job
      </Button>
      {update.error ? <FormError className="w-full">{update.error.message}</FormError> : null}
    </form>
  );
}
