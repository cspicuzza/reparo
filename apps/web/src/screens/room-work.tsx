import { Pencil } from 'lucide-react';
import { useReturnFocus } from '@/lib/editor-focus';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { StatusBadge, StatusSelect } from '@/components/status';
import { useMe } from '@/lib/me';
import { useTRPC } from '@/lib/trpc';
import { SPEC_SOURCE_LABEL, type RoomJob } from '@/lib/work';
import { JobRoomEditor } from './job-room-editor';
import { Button } from '@/components/ui/button';
import { celebrateMended } from '@/lib/mended';
import { SaveState } from '@/components/save-state';
import { ListPlaceholder } from '@/components/placeholder';
import { LoadError } from '@/components/load-error';
import { useRefreshJobs } from '@/lib/refresh';
import { TEXT_LINK } from '@/lib/utils';

/**
 * The jobs covering one room. Here you change only this room's status, spec and notes; the
 * job itself (its rooms, house-wide spec, phase, vendor) is edited on the job's page.
 */
export function RoomWork({ roomId, roomName }: { roomId: string; roomName: string }) {
  const trpc = useTRPC();
  const { canEdit } = useMe();
  const jobs = useQuery(trpc.jobs.forRoom.queryOptions({ roomId }));
  const [editing, setEditing] = useState<string | null>(null);
  useReturnFocus(editing ? `jr-${editing}` : null);

  if (jobs.isPending) return <ListPlaceholder label="Loading jobs" rows={2} />;
  if (jobs.error) return <LoadError what="this room's jobs" error={jobs.error} retry={[jobs]} />;

  if (jobs.data.length === 0) {
    return (
      <p className="text-muted-foreground">
        No jobs cover this room yet.
        {canEdit ? (
          <>
            {' '}
            Add one on the{' '}
            <Link to="/jobs" className={TEXT_LINK}>
              Jobs page
            </Link>{' '}
            and tick {roomName}.
          </>
        ) : null}
      </p>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-border">
        {jobs.data.map((j) => (
          <li key={j.id} className="py-4 first:pt-0 last:pb-0">
            <JobRow
              j={j}
              roomName={roomName}
              canEdit={canEdit}
              editing={editing === j.id}
              onEdit={() => setEditing(j.id)}
              onDone={() => setEditing(null)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function JobRow({
  j,
  roomName,
  canEdit,
  editing,
  onEdit,
  onDone,
}: {
  j: RoomJob;
  roomName: string;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const refresh = useRefreshJobs();
  // Each row saves on its own, so one save never locks or hides another row (OD-72).
  const setStatus = useMutation(
    trpc.jobRooms.update.mutationOptions({
      onSuccess: (_data, vars) => {
        if (vars.status === 'completed') celebrateMended();
        // Returning the refetch keeps the save pending until the new status is on screen.
        return refresh();
      },
    }),
  );
  // Shown at once while it saves; a failed save falls back to what the server holds.
  const shown = (setStatus.isPending ? setStatus.variables.status : undefined) ?? j.status;
  const what = `Status of ${j.job.name} in ${roomName}`;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            to="/jobs/$jobId"
            params={{ jobId: j.job.id }}
            className="inline-flex min-h-11 items-center text-lg font-semibold underline underline-offset-4 hover:decoration-2"
          >
            {j.job.name}
          </Link>
          <span className="text-sm text-muted-foreground">
            {j.vendor ? `${j.phase.name}, ${j.vendor.name}` : j.phase.name}
          </span>
          {j.specSource === 'room' ? (
            <span className="rounded-lg border border-input px-2 py-0.5 text-sm font-semibold">
              Different here
            </span>
          ) : null}
        </div>
        {canEdit ? (
          // Can shrink, so a long status at large text truncates instead of pushing the page
          // sideways (OD-142).
          <div className="flex max-w-full min-w-0 flex-col items-end gap-1">
            <StatusSelect
              id={`status-${j.id}`}
              label={what}
              value={shown}
              onChange={(status) => setStatus.mutate({ id: j.id, status })}
            />
            <SaveState
              mutation={setStatus}
              what={what}
              onRetry={() => setStatus.mutate(setStatus.variables ?? { id: j.id })}
            />
          </div>
        ) : (
          <StatusBadge status={j.status} />
        )}
      </div>

      {editing ? (
        <div className="mt-3 rounded-xl border border-border bg-background p-4">
          <JobRoomEditor
            idPrefix={`jr-${j.id}`}
            jobRoom={j}
            jobSpec={j.job.spec}
            roomName={roomName}
            onDone={onDone}
          />
        </div>
      ) : (
        <div className="mt-2 grid gap-1 sm:grid-cols-[1fr_auto] sm:gap-6">
          <div className="min-w-0">
            {/* A room's own spec is flagged by the "Different here" badge above. */}
            {j.specSource === 'job' && j.resolvedSpec ? (
              <p className="text-sm text-muted-foreground">{SPEC_SOURCE_LABEL.job}</p>
            ) : null}
            {j.resolvedSpec ? (
              <p className="mt-0.5 max-w-prose whitespace-pre-wrap">{j.resolvedSpec}</p>
            ) : (
              <p className="mt-0.5 text-muted-foreground">No spec yet.</p>
            )}
            {j.notes ? (
              <p className="mt-1 max-w-prose text-sm text-muted-foreground whitespace-pre-wrap">
                {j.notes}
              </p>
            ) : null}
          </div>
          {canEdit ? (
            <div className="sm:text-right">
              <Button
                type="button"
                onClick={onEdit}
                data-return-focus={`jr-${j.id}`}
                variant="ghost"
                className="px-0 sm:px-3"
              >
                <Pencil aria-hidden absoluteStrokeWidth strokeWidth={2} />
                Edit spec &amp; notes
                <span className="sr-only"> for {j.job.name}</span>
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
