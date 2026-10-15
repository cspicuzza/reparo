import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronLeft, Mail, Phone } from 'lucide-react';
import { useState } from 'react';
import { FormError } from '@/components/form';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { StatusBadge, StatusSelect } from '@/components/status';
import { TapeStrip } from '@/components/tape';
import { Button, buttonVariants } from '@/components/ui/button';
import { celebrateMended } from '@/lib/mended';
import { useMe } from '@/lib/me';
import { trpcErrorCode, useTRPC } from '@/lib/trpc';
import { telHref } from '@/lib/vendors';
import { progressText, SPEC_SOURCE_LABEL, type Job } from '@/lib/work';
import { JobEditor } from './job-editor';
import { JobMoney } from './job-money';
import { JobRoomEditor } from './job-room-editor';

/**
 * One job (M2, OD-46; replaces the item page): who's doing it, the house-wide spec, and each
 * room it covers with that room's status and spec. A room's status saves the moment it's picked.
 */
export function JobDetail() {
  const { jobId } = useParams({ from: '/_app/jobs/$jobId' });
  const trpc = useTRPC();
  const { canEdit } = useMe();
  const job = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const [editing, setEditing] = useState(false);

  if (job.isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (job.error) {
    return (
      <section>
        <p role="alert">
          {trpcErrorCode(job.error) === 'NOT_FOUND'
            ? 'That job is no longer here.'
            : job.error.message}
        </p>
        <BackToJobs />
      </section>
    );
  }
  const j = job.data;

  return (
    <section className="flex flex-col gap-8">
      <div>
        <BackToJobs />
        <div className="mt-2">
          <PageHeader
            title={j.name}
            description={j.phase.name}
            action={
              canEdit && !editing ? (
                <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                  Edit job
                </Button>
              ) : null
            }
          />
        </div>
      </div>

      {editing ? (
        <Panel aria-labelledby="edit-job">
          <h2 id="edit-job" className="text-2xl">
            Edit {j.name}
          </h2>
          <div className="mt-4">
            <JobEditor
              idPrefix={`job-${j.id}`}
              job={j}
              onSaved={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          </div>
        </Panel>
      ) : (
        <JobBody job={j} canEdit={canEdit} />
      )}
    </section>
  );
}

function BackToJobs() {
  return (
    <Link
      to="/jobs"
      className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft aria-hidden className="size-5" />
      All jobs
    </Link>
  );
}

function JobBody({ job, canEdit }: { job: Job; canEdit: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.jobs.pathFilter()),
      queryClient.invalidateQueries(trpc.home.pathFilter()),
      queryClient.invalidateQueries(trpc.rooms.pathFilter()),
      queryClient.invalidateQueries(trpc.phases.pathFilter()),
    ]);
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
  const remove = useMutation(
    trpc.jobs.remove.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        await navigate({ to: '/jobs' });
      },
    }),
  );
  const error = roomStatus.error ?? jobStatus.error ?? remove.error;
  const progress = progressText(job.progress, job.rooms.length);

  return (
    <>
      <Panel aria-labelledby="job-progress">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="job-progress" className="text-2xl">
            How it&apos;s going
          </h2>
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
              done={job.progress.done}
              total={job.progress.total}
              label={`${job.name}: ${progress}`}
            />
            <span className="text-muted-foreground tabular-nums">{progress}</span>
          </div>
        ) : (
          <p className="mt-3 text-muted-foreground">Covers no rooms, so its status is set here.</p>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel aria-labelledby="job-vendor">
          <h2 id="job-vendor" className="text-2xl">
            Who&apos;s doing it
          </h2>
          <VendorBlock vendor={job.vendor} />
        </Panel>
        <Panel aria-labelledby="job-spec">
          <h2 id="job-spec" className="text-2xl">
            Spec
          </h2>
          {job.spec ? (
            <p className="mt-3 max-w-prose whitespace-pre-wrap">{job.spec}</p>
          ) : (
            <p className="mt-3 text-muted-foreground">No spec yet.</p>
          )}
          {job.notes ? (
            <>
              <h3 className="mt-5 text-base font-semibold">Notes</h3>
              <p className="mt-1 max-w-prose text-muted-foreground whitespace-pre-wrap">
                {job.notes}
              </p>
            </>
          ) : null}
        </Panel>
      </div>

      <JobMoney job={job} canEdit={canEdit} />

      <Panel aria-labelledby="job-rooms">
        <h2 id="job-rooms" className="text-2xl">
          Rooms
        </h2>
        {job.rooms.length === 0 ? (
          <p className="mt-3 text-muted-foreground">
            This job covers no rooms.{canEdit ? ' Edit the job to add some.' : ''}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {job.rooms.map((r) => (
              <li key={r.id} className="py-3 last:pb-0">
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
                        <span className="text-sm text-muted-foreground">
                          {SPEC_SOURCE_LABEL.job}
                        </span>
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
        )}
      </Panel>

      {error ? <FormError>{error.message}</FormError> : null}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
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
            <Button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              variant="ghost"
              className="text-muted-foreground"
            >
              Remove job
            </Button>
          )}
        </div>
      ) : null}
    </>
  );
}

/** The job's vendor with tap-to-call and tap-to-email, or a note that nobody is set. */
function VendorBlock({ vendor }: { vendor: Job['vendor'] }) {
  if (!vendor) {
    return <p className="mt-3 text-muted-foreground">No vendor yet.</p>;
  }
  return (
    <div className="mt-3">
      <Link
        to="/vendors"
        className="inline-flex min-h-11 items-center text-xl font-semibold underline-offset-4 hover:underline"
      >
        {vendor.name}
      </Link>
      {vendor.trade ? <p className="text-muted-foreground">{vendor.trade}</p> : null}
      {vendor.archived ? (
        <p className="mt-1 text-sm text-muted-foreground">Archived: not offered for new jobs.</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {vendor.phone ? (
          <a href={telHref(vendor.phone)} className={buttonVariants({ variant: 'outline' })}>
            <Phone aria-hidden className="size-4" />
            {vendor.phone}
          </a>
        ) : null}
        {vendor.email ? (
          <a
            href={`mailto:${vendor.email}`}
            className={buttonVariants({ variant: 'outline', className: 'max-w-full break-all' })}
          >
            <Mail aria-hidden className="size-4 shrink-0" />
            {vendor.email}
          </a>
        ) : null}
      </div>
    </div>
  );
}
