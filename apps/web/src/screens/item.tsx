import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { dangerButtonClass, primaryButtonClass, quietButtonClass } from '@/components/form';
import { StatusBadge, StatusSelect } from '@/components/status';
import { useMe } from '@/lib/me';
import { trpcErrorCode, useTRPC } from '@/lib/trpc';
import { progressText, SPEC_SOURCE_LABEL, type Job } from '@/lib/work';
import { JobEditor } from './job-editor';
import { JobRoomEditor } from './job-room-editor';

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

  if (item.isPending || jobs.isPending) return <p className="text-pencil">Loading…</p>;
  const err = item.error ?? jobs.error;
  if (err) {
    return (
      <section>
        <p role="alert">
          {trpcErrorCode(err) === 'NOT_FOUND' ? 'That item is no longer here.' : err.message}
        </p>
        <Link to="/items" className="mt-4 inline-block text-sm text-pencil hover:underline">
          ← All items
        </Link>
      </section>
    );
  }

  const it = item.data;
  if (!it || !jobs.data) return <p className="text-pencil">Loading…</p>;
  const retired = it.retiredAt !== null;
  const category = categories.data?.find((c) => c.id === it.categoryId)?.name;

  return (
    <section>
      <Link to="/items" className="text-sm text-pencil underline-offset-4 hover:underline">
        ← All items
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {it.name}
            {retired ? (
              <span className="ml-3 text-base font-normal text-pencil">retired</span>
            ) : null}
          </h1>
          {category ? <p className="mt-1 text-sm text-pencil">{category}</p> : null}
        </div>
        {canEdit && !retired && !adding ? (
          <button type="button" onClick={() => setAdding(true)} className={primaryButtonClass}>
            New job
          </button>
        ) : null}
      </div>

      {adding ? (
        <div className="mt-6 rounded-lg border border-chalk p-5">
          <h2 className="text-lg font-medium">New {it.name} job</h2>
          <div className="mt-4">
            <JobEditor idPrefix="new-job" item={it} onDone={() => setAdding(false)} />
          </div>
        </div>
      ) : null}

      <h2 className="mt-10 text-lg font-medium">Jobs</h2>
      {jobs.data.length === 0 ? (
        <p className="mt-2 text-pencil">
          No {it.name} jobs yet.
          {canEdit && !retired ? ' Add one to say what is being done and in which rooms.' : ''}
        </p>
      ) : (
        <ul className="mt-3 grid gap-6">
          {jobs.data.map((job) => (
            <li key={job.id} className="rounded-lg border border-chalk p-4 sm:p-5">
              <JobCard job={job} item={it} canEdit={canEdit} />
            </li>
          ))}
        </ul>
      )}
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
  const roomStatus = useMutation(trpc.jobRooms.update.mutationOptions({ onSuccess: invalidate }));
  const jobStatus = useMutation(trpc.jobs.update.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(trpc.jobs.remove.mutationOptions({ onSuccess: invalidate }));
  const error = roomStatus.error ?? jobStatus.error ?? remove.error;

  if (editing) {
    return (
      <div>
        <h3 className="font-medium">Edit {job.name}</h3>
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
          <h3 className="font-medium">{job.name}</h3>
          <p className="mt-0.5 text-sm text-pencil">
            {job.phase.name}
            {progress ? ` · ${progress}` : ''}
          </p>
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

      {job.spec ? (
        <p className="mt-3 max-w-prose text-sm whitespace-pre-wrap">{job.spec}</p>
      ) : (
        <p className="mt-3 text-sm text-pencil">No spec yet.</p>
      )}
      {job.notes ? (
        <p className="mt-1 max-w-prose text-sm text-pencil whitespace-pre-wrap">{job.notes}</p>
      ) : null}

      {job.rooms.length > 0 ? (
        <ul className="mt-4 divide-y divide-chalk border-t border-chalk">
          {job.rooms.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <Link
                  to="/rooms/$roomId"
                  params={{ roomId: r.room.id }}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {r.room.name}
                </Link>
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
                <div className="mt-3 rounded-lg border border-chalk p-4">
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
                  <p className="min-w-0 text-sm">
                    <span className="text-pencil">{SPEC_SOURCE_LABEL[r.specSource]}</span>
                    {r.specSource === 'room' ? (
                      <span className="block whitespace-pre-wrap">{r.resolvedSpec}</span>
                    ) : null}
                    {r.notes ? (
                      <span className="block text-pencil whitespace-pre-wrap">{r.notes}</span>
                    ) : null}
                  </p>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => setEditingRoom(r.id)}
                      aria-label={`Edit spec and notes for ${r.room.name}`}
                      className={quietButtonClass + ' px-0 sm:px-3'}
                    >
                      Edit spec &amp; notes
                    </button>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-pencil">Covers no rooms — its status is set above.</p>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-sm">
          {error.message}
        </p>
      ) : null}

      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-chalk pt-3 text-sm">
          {confirmingRemove ? (
            <>
              <span>Remove {job.name}?</span>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: job.id })}
                className={dangerButtonClass}
              >
                Yes, remove it
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRemove(false)}
                className={quietButtonClass}
              >
                Keep it
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setEditing(true)} className={quietButtonClass}>
                Edit job &amp; rooms
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                className={quietButtonClass + ' text-pencil'}
              >
                Remove job
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
