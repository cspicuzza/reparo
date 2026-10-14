import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { StatusBadge, StatusSelect } from '@/components/status';
import { useMe } from '@/lib/me';
import { useTRPC } from '@/lib/trpc';
import { SPEC_SOURCE_LABEL, type RoomJob } from '@/lib/work';
import { JobRoomEditor } from './job-room-editor';
import { Button } from '@/components/ui/button';
import { celebrateMended } from '@/lib/mended';
import { FormError } from '@/components/form';

/**
 * The jobs covering one room. Here you change only this room's status, spec and notes; the
 * job itself (its rooms, house-wide spec, phase) is edited on its item's page.
 */
export function RoomWork({ roomId, roomName }: { roomId: string; roomName: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { canEdit } = useMe();
  const jobs = useQuery(trpc.jobs.forRoom.queryOptions({ roomId }));
  const [editing, setEditing] = useState<string | null>(null);
  const setStatus = useMutation(
    trpc.jobRooms.update.mutationOptions({
      onSuccess: (_data, vars) => {
        if (vars.status === 'completed') celebrateMended();
        return queryClient.invalidateQueries(trpc.jobs.pathFilter());
      },
    }),
  );

  if (jobs.isPending) return <p className="text-muted-foreground">Loading jobs…</p>;
  if (jobs.error) return <p role="alert">Couldn&apos;t load jobs: {jobs.error.message}</p>;

  if (jobs.data.length === 0) {
    return (
      <p className="text-muted-foreground">
        No jobs cover this room yet. Jobs are set up on an item&apos;s page —{' '}
        <Link to="/items" className="text-foreground underline underline-offset-4">
          pick an item
        </Link>{' '}
        (Paint, Flooring…) and add a job that includes {roomName}.
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
              busy={setStatus.isPending}
              onStatus={(status) => setStatus.mutate({ id: j.id, status })}
              onEdit={() => setEditing(j.id)}
              onDone={() => setEditing(null)}
            />
          </li>
        ))}
      </ul>
      {setStatus.error ? <FormError>{setStatus.error.message}</FormError> : null}
    </div>
  );
}

function JobRow({
  j,
  roomName,
  canEdit,
  editing,
  busy,
  onStatus,
  onEdit,
  onDone,
}: {
  j: RoomJob;
  roomName: string;
  canEdit: boolean;
  editing: boolean;
  busy: boolean;
  onStatus: (status: RoomJob['status']) => void;
  onEdit: () => void;
  onDone: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            to="/items/$itemId"
            params={{ itemId: j.item.id }}
            className="inline-flex min-h-11 items-center text-xl font-semibold underline-offset-4 hover:underline"
          >
            {j.job.name}
          </Link>
          <span className="text-sm text-muted-foreground">{j.phase.name}</span>
          {j.specSource === 'room' ? (
            <span className="rounded-lg border border-input px-2 py-0.5 text-sm font-semibold">
              Different here
            </span>
          ) : null}
        </div>
        {canEdit ? (
          <StatusSelect
            id={`status-${j.id}`}
            label={`Status of ${j.job.name} in ${roomName}`}
            value={j.status}
            disabled={busy}
            onChange={onStatus}
          />
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
            {j.specSource === 'job' ? (
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
              <Button type="button" onClick={onEdit} variant="ghost" className="px-0 sm:px-3">
                Edit spec &amp; notes
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
