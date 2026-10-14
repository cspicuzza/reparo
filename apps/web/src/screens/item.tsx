import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { StatusBadge, StatusSelect } from '@/components/status';
import { useMe } from '@/lib/me';
import { trpcErrorCode, useTRPC } from '@/lib/trpc';
import { progressText, SPEC_SOURCE_LABEL, type Job } from '@/lib/work';
import { JobEditor } from './job-editor';
import { JobRoomEditor } from './job-room-editor';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { TapeStrip } from '@/components/tape';
import { celebrateMended } from '@/lib/mended';
import { FormError } from '@/components/form';

/**
 * One item across the house: its jobs in every phase, each with the rooms it covers. Jobs are
 * created and edited here (Chris, 2026-10-14); a room's status saves the moment it's picked.
 */
export function ItemDetail() {
  const { itemId } = useParams({ from: '/_app/items/$itemId' });
  const trpc = useTRPC();
  const { canEdit } = useMe();
  const item = useQuery(trpc.items.get.queryOptions({ id: itemId }));
  const categories = useQuery(trpc.categories.list.queryOptions());
  const jobs = useQuery(trpc.jobs.list.queryOptions({ itemId }));
  const [adding, setAdding] = useState(false);

  if (item.isPending || jobs.isPending) return <p className="text-muted-foreground">Loading…</p>;
  const err = item.error ?? jobs.error;
  if (err) {
    return (
      <section>
        <p role="alert">
          {trpcErrorCode(err) === 'NOT_FOUND' ? 'That item is no longer here.' : err.message}
        </p>
        <Link
          to="/items"
          className="mt-4 inline-flex min-h-11 items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-5" />
          All items
        </Link>
      </section>
    );
  }

  const it = item.data;
  if (!it || !jobs.data) return <p className="text-muted-foreground">Loading…</p>;
  const retired = it.retiredAt !== null;
  const category = categories.data?.find((c) => c.id === it.categoryId)?.name;

  return (
    <section className="flex flex-col gap-8">
      <div>
        <Link
          to="/items"
          className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-5" />
          All items
        </Link>
        <div className="mt-2">
          <PageHeader
            title={it.name}
            description={
              [category, retired ? 'Retired: kept on its jobs, not offered for new ones' : null]
                .filter(Boolean)
                .join('. ') || undefined
            }
            action={
              canEdit && !retired && !adding ? (
                <Button type="button" onClick={() => setAdding(true)}>
                  Add a job
                </Button>
              ) : null
            }
          />
        </div>
      </div>

      {adding ? (
        <Panel aria-labelledby="new-job">
          <h2 id="new-job" className="text-2xl">
            New {it.name} job
          </h2>
          <div className="mt-4">
            <JobEditor idPrefix="new-job" item={it} onDone={() => setAdding(false)} />
          </div>
        </Panel>
      ) : null}

      <section aria-labelledby="item-jobs">
        <h2 id="item-jobs" className="text-2xl">
          Jobs
        </h2>
        {jobs.data.length === 0 ? (
          <p className="mt-2 text-muted-foreground">
            No {it.name} jobs yet.
            {canEdit && !retired ? ' Add one to say what is being done and in which rooms.' : ''}
          </p>
        ) : (
          <ul className="mt-4 grid gap-6">
            {jobs.data.map((job) => (
              <li key={job.id} className="rounded-xl border border-border bg-card p-5 sm:p-6">
                <JobCard job={job} item={it} canEdit={canEdit} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function JobCard({
  job,
  item,
  canEdit,
}: {
  job: Job;
  item: { id: string; name: string };
  canEdit: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const invalidate = () => queryClient.invalidateQueries(trpc.jobs.pathFilter());
  const mendIfCompleted = (vars: { status?: string | undefined }) => {
    if (vars.status === 'completed') celebrateMended();
  };
  const roomStatus = useMutation(
    trpc.jobRooms.update.mutationOptions({
      onSuccess: (_d, vars) => {
        mendIfCompleted(vars);
        return invalidate();
      },
    }),
  );
  const jobStatus = useMutation(
    trpc.jobs.update.mutationOptions({
      onSuccess: (_d, vars) => {
        mendIfCompleted(vars);
        return invalidate();
      },
    }),
  );
  const remove = useMutation(trpc.jobs.remove.mutationOptions({ onSuccess: invalidate }));
  const error = roomStatus.error ?? jobStatus.error ?? remove.error;

  if (editing) {
    return (
      <div>
        <h3 className="text-xl">Edit {job.name}</h3>
        <div className="mt-4">
          <JobEditor
            idPrefix={`job-${job.id}`}
            item={item}
            job={job}
            onDone={() => setEditing(false)}
          />
        </div>
      </div>
    );
  }

  const progress = progressText(job.progress, job.rooms.length);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-2xl">{job.name}</h3>
          <p className="mt-1 text-muted-foreground">{job.phase.name}</p>
        </div>
        {job.rooms.length === 0 && canEdit ? (
          <StatusSelect
            id={`job-status-${job.id}`}
            label={`Status of ${job.name}`}
            value={job.progress.status}
            disabled={jobStatus.isPending}
            onChange={(status) => jobStatus.mutate({ id: job.id, status })}
          />
        ) : (
          <StatusBadge status={job.progress.status} />
        )}
      </div>

      {job.rooms.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <TapeStrip
            mode="progress"
            size="sm"
            done={job.progress.done}
            total={job.progress.total}
            label={`${job.name}: ${progress}`}
          />
          <span className="text-sm text-muted-foreground tabular-nums">{progress}</span>
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-sm text-muted-foreground">Spec</p>
        {job.spec ? (
          <p className="mt-0.5 max-w-prose whitespace-pre-wrap">{job.spec}</p>
        ) : (
          <p className="mt-0.5 text-muted-foreground">No spec yet.</p>
        )}
        {job.notes ? (
          <p className="mt-2 max-w-prose text-muted-foreground whitespace-pre-wrap">{job.notes}</p>
        ) : null}
      </div>

      {job.rooms.length > 0 ? (
        <ul className="mt-5 divide-y divide-border border-t border-border">
          {job.rooms.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    to="/rooms/$roomId"
                    params={{ roomId: r.room.id }}
                    className="inline-flex min-h-11 items-center text-xl font-semibold underline-offset-4 hover:underline"
                  >
                    {r.room.name}
                  </Link>
                  {r.specSource === 'room' ? (
                    <span className="rounded-lg border border-input px-2 py-0.5 text-sm font-semibold">
                      Different here
                    </span>
                  ) : null}
                </div>
                {canEdit ? (
                  <StatusSelect
                    id={`room-status-${r.id}`}
                    label={`Status of ${job.name} in ${r.room.name}`}
                    value={r.status}
                    disabled={roomStatus.isPending}
                    onChange={(status) => roomStatus.mutate({ id: r.id, status })}
                  />
                ) : (
                  <StatusBadge status={r.status} />
                )}
              </div>
              {editingRoom === r.id ? (
                <div className="mt-3 rounded-xl border border-border bg-background p-4">
                  <JobRoomEditor
                    idPrefix={`jr-${r.id}`}
                    jobRoom={r}
                    jobSpec={job.spec}
                    roomName={r.room.name}
                    onDone={() => setEditingRoom(null)}
                  />
                </div>
              ) : (
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="min-w-0">
                    {r.specSource === 'room' ? (
                      <span className="block whitespace-pre-wrap">{r.resolvedSpec}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">{SPEC_SOURCE_LABEL.job}</span>
                    )}
                    {r.notes ? (
                      <span className="block text-muted-foreground whitespace-pre-wrap">
                        {r.notes}
                      </span>
                    ) : null}
                  </p>
                  {canEdit ? (
                    <Button
                      type="button"
                      onClick={() => setEditingRoom(r.id)}
                      aria-label={`Edit spec and notes for ${r.room.name}`}
                      variant="ghost"
                      className="px-0 sm:px-3"
                    >
                      Edit spec &amp; notes
                    </Button>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Covers no rooms, so its status is set above.
        </p>
      )}

      {error ? <FormError>{error.message}</FormError> : null}

      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {confirmingRemove ? (
            <>
              <span>Remove {job.name}?</span>
              <Button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: job.id })}
                variant="destructive"
              >
                Yes, remove it
              </Button>
              <Button type="button" onClick={() => setConfirmingRemove(false)} variant="ghost">
                Keep it
              </Button>
            </>
          ) : (
            <>
              <Button type="button" onClick={() => setEditing(true)} variant="ghost">
                Edit job &amp; rooms
              </Button>
              <Button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                variant="ghost"
                className="text-muted-foreground"
              >
                Remove job
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
