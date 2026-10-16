import { useReturnFocus } from '@/lib/editor-focus';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronLeft, Mail, Pencil, Phone } from 'lucide-react';
import { useState } from 'react';
import { EditPanel } from '@/components/edit-panel';
import { FormError } from '@/components/form';
import { SaveState } from '@/components/save-state';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { StatusBadge, StatusSelect } from '@/components/status';
import { TapeStrip } from '@/components/tape';
import { Button, buttonVariants } from '@/components/ui/button';
import { celebrateMended } from '@/lib/mended';
import { useMe } from '@/lib/me';
import { useToasts } from '@/lib/toasts';
import { trpcClient, trpcErrorCode, useTRPC } from '@/lib/trpc';
import { telHref } from '@/lib/vendors';
import { progressText, SPEC_SOURCE_LABEL, type Job } from '@/lib/work';
import { JobNameField, JobPanelBody } from './job-panel';
import { JobEstimates } from './job-estimates';
import { JobFiles } from './job-files';
import { JobMoney } from './job-money';
import { JobRoomEditor } from './job-room-editor';
import { PageTitle } from '@/components/page-title';
import { PagePlaceholder } from '@/components/placeholder';
import { LoadError } from '@/components/load-error';
import { ConfirmRemove } from '@/components/confirm-remove';
import { useRefreshJobs } from '@/lib/refresh';

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
  useReturnFocus(editing ? 'edit-job' : null);

  if (job.isPending) {
    return (
      <>
        <PageTitle parts={['Jobs']} />
        <PagePlaceholder label="Loading the job" />
      </>
    );
  }
  if (job.error) {
    return (
      <section>
        <PageTitle parts={['Jobs']} />
        {trpcErrorCode(job.error) === 'NOT_FOUND' ? (
          <p role="alert">That job is no longer here.</p>
        ) : (
          <LoadError what="this job" error={job.error} retry={[job]} />
        )}
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
            tabTitle={[j.name, 'Jobs']}
            description={j.phase.name}
            action={
              canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(true)}
                  data-return-focus="edit-job"
                >
                  <Pencil aria-hidden absoluteStrokeWidth strokeWidth={2} />
                  Edit job
                </Button>
              ) : null
            }
          />
        </div>
      </div>

      <JobBody job={j} canEdit={canEdit} />

      {/* Edited in place: every change saves as it's made (OD-89). */}
      <EditPanel
        open={editing}
        title={j.name}
        focusFirstField={false}
        heading={<JobNameField job={j} />}
        onClose={() => setEditing(false)}
      >
        <JobPanelBody job={j} />
      </EditPanel>
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
  const navigate = useNavigate();
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  useReturnFocus(editingRoom ? `jr-${editingRoom}` : null);
  const toasts = useToasts();
  const invalidate = useRefreshJobs();
  const mendIfCompleted = (vars: { status?: string | undefined }) => {
    if (vars.status === 'completed') celebrateMended();
  };
  const jobStatus = useMutation(
    trpc.jobs.update.mutationOptions({
      onSuccess: (_d, vars) => {
        mendIfCompleted(vars);
        return invalidate();
      },
    }),
  );
  // Removing offers Undo for 10 seconds (OD-113, Q129).
  const remove = useMutation(
    trpc.jobs.remove.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        await navigate({ to: '/jobs' });
        toasts.add({
          title: `Removed ${job.name}`,
          timeout: 10_000,
          actionProps: {
            children: 'Undo',
            onClick: () =>
              void trpcClient.jobs.restore
                .mutate({ id: job.id })
                .then(invalidate)
                .catch(() => undefined),
          },
        });
      },
    }),
  );
  const progress = progressText(job.progress, job.rooms.length);

  return (
    <>
      <Panel aria-labelledby="job-progress">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="job-progress" className="text-2xl">
            How it&apos;s going
          </h2>
          {job.rooms.length === 0 && canEdit ? (
            <div className="flex flex-col items-end gap-1">
              <StatusSelect
                id={`job-status-${job.id}`}
                label={`Status of ${job.name}`}
                value={
                  (jobStatus.isPending ? jobStatus.variables.status : undefined) ??
                  job.progress.status
                }
                onChange={(status) => jobStatus.mutate({ id: job.id, status })}
              />
              <SaveState
                mutation={jobStatus}
                what={`Status of ${job.name}`}
                onRetry={() => jobStatus.mutate(jobStatus.variables ?? { id: job.id })}
              />
            </div>
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
                    <RoomStatus
                      jobRoomId={r.id}
                      status={r.status}
                      what={`Status of ${job.name} in ${r.room.name}`}
                      onSaved={invalidate}
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
                        data-return-focus={`jr-${r.id}`}
                        aria-label={`Edit spec and notes for ${r.room.name}`}
                        variant="ghost"
                        className="px-0 sm:px-3"
                      >
                        <Pencil aria-hidden absoluteStrokeWidth strokeWidth={2} />
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

      <JobEstimates job={job} canEdit={canEdit} />

      <JobMoney job={job} canEdit={canEdit} />

      <JobFiles jobId={job.id} canEdit={canEdit} />

      {canEdit ? (
        <div>
          <ConfirmRemove
            strong
            what={job.name}
            label="Remove job"
            question={`Remove ${job.name}?`}
            disabled={remove.isPending}
            onConfirm={() => remove.mutate({ id: job.id })}
          />
          {remove.error ? <FormError>{remove.error.message}</FormError> : null}
        </div>
      ) : null}
    </>
  );
}

/**
 * One covered room's status on the job page. Each row saves on its own (OD-72): it shows the
 * new status at once, says Saving / Saved / Couldn't save beside it, and locks only itself.
 */
function RoomStatus({
  jobRoomId,
  status,
  what,
  onSaved,
}: {
  jobRoomId: string;
  status: Job['rooms'][number]['status'];
  what: string;
  onSaved: () => Promise<unknown>;
}) {
  const trpc = useTRPC();
  const save = useMutation(
    trpc.jobRooms.update.mutationOptions({
      onSuccess: (_d, vars) => {
        if (vars.status === 'completed') celebrateMended();
        // Returning the refetch keeps the save pending until the new status is on screen.
        return onSaved();
      },
    }),
  );
  return (
    <div className="flex flex-col items-end gap-1">
      <StatusSelect
        id={`room-status-${jobRoomId}`}
        label={what}
        value={(save.isPending ? save.variables.status : undefined) ?? status}
        onChange={(next) => save.mutate({ id: jobRoomId, status: next })}
      />
      <SaveState
        mutation={save}
        what={what}
        onRetry={() => save.mutate(save.variables ?? { id: jobRoomId })}
      />
    </div>
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
        search={{ vendor: vendor.id }}
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
