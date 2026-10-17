import { useReturnFocus } from '@/lib/editor-focus';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronLeft, Mail, Pencil, Phone, Plus } from 'lucide-react';
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
import { undoAction, useToasts } from '@/lib/toasts';
import { trpcClient, trpcErrorCode, useTRPC } from '@/lib/trpc';
import { money, moneyStep } from '@/lib/money';
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

      <JobSummary job={j} canEdit={canEdit} />

      <JobBody job={j} canEdit={canEdit} onEditJob={() => setEditing(true)} />

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
      <ChevronLeft aria-hidden absoluteStrokeWidth strokeWidth={1.5} className="size-5" />
      All jobs
    </Link>
  );
}

/**
 * The job at a glance, under its title (OD-120, Q148): where it stands, what's still to pay
 * with its tape, and who's doing it with call and email.
 */
function JobSummary({ job, canEdit }: { job: Job; canEdit: boolean }) {
  const { costCents, paidCents, owedCents } = job.money;
  const v = job.vendor;
  return (
    <Panel
      aria-label="The job at a glance"
      className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-5 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]"
    >
      <div>
        <p className="text-sm text-muted-foreground">Status</p>
        <div className="mt-1">
          {/* A job with no rooms has its status set right here (OD-129, Q181). */}
          {job.rooms.length === 0 && canEdit ? (
            <JobStatusPicker job={job} />
          ) : (
            <StatusBadge status={job.progress.status} />
          )}
        </div>
        {job.rooms.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Covers no rooms</p>
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">Still to pay</p>
        {costCents > 0 ? (
          <>
            <p className="text-xl font-semibold tabular-nums">{money(owedCents)}</p>
            <TapeStrip
              mode="money"
              size="sm"
              usedCents={paidCents}
              totalCents={costCents}
              stepCents={moneyStep(costCents)}
              label={`Paid ${money(paidCents)} of ${money(costCents)}`}
              className="mt-2"
            />
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">
              {money(paidCents)} paid of {money(costCents)}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">No price yet</p>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">Who&apos;s doing it</p>
        {v ? (
          <>
            <Link
              to="/vendors"
              search={{ vendor: v.id }}
              className="inline-flex min-h-11 min-w-11 items-center text-xl font-semibold underline-offset-4 hover:underline"
            >
              {v.name}
            </Link>
            {v.trade ? <p className="text-sm text-muted-foreground">{v.trade}</p> : null}
            {v.archived ? (
              <p className="text-sm text-muted-foreground">Archived: not offered for new jobs.</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {v.phone ? (
                <a href={telHref(v.phone)} className={buttonVariants({ variant: 'outline' })}>
                  <Phone aria-hidden absoluteStrokeWidth strokeWidth={1.5} className="size-4" />
                  Call
                  <span className="sr-only"> {v.name}</span>
                </a>
              ) : null}
              {v.email ? (
                <a href={`mailto:${v.email}`} className={buttonVariants({ variant: 'outline' })}>
                  <Mail aria-hidden absoluteStrokeWidth strokeWidth={1.5} className="size-4" />
                  Email
                  <span className="sr-only"> {v.name}</span>
                </a>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">No vendor yet</p>
        )}
      </div>
    </Panel>
  );
}

/** The status of a job with no rooms, saved when picked; Completed stitches the logo closed. */
function JobStatusPicker({ job }: { job: Job }) {
  const trpc = useTRPC();
  const invalidate = useRefreshJobs();
  const jobStatus = useMutation(
    trpc.jobs.update.mutationOptions({
      onSuccess: (_d, vars) => {
        if (vars.status === 'completed') celebrateMended();
        return invalidate();
      },
    }),
  );
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusSelect
        id={`job-status-${job.id}`}
        label={`Status of ${job.name}`}
        value={
          (jobStatus.isPending ? jobStatus.variables.status : undefined) ?? job.progress.status
        }
        onChange={(status) => jobStatus.mutate({ id: job.id, status })}
      />
      <SaveState
        mutation={jobStatus}
        what={`Status of ${job.name}`}
        onRetry={() => jobStatus.mutate(jobStatus.variables ?? { id: job.id })}
      />
    </div>
  );
}

function JobBody({
  job,
  canEdit,
  onEditJob,
}: {
  job: Job;
  canEdit: boolean;
  /** Opens the job's panel, for adding a spec. */
  onEditJob: () => void;
}) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  useReturnFocus(editingRoom ? `jr-${editingRoom}` : null);
  const toasts = useToasts();
  const invalidate = useRefreshJobs();
  // Removing offers Undo for 10 seconds (OD-113, Q129).
  const remove = useMutation(
    trpc.jobs.remove.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        await navigate({ to: '/jobs' });
        toasts.add({
          title: `Removed ${job.name}`,
          timeout: 10_000,
          actionProps: undoAction(toasts, () =>
            trpcClient.jobs.restore.mutate({ id: job.id }).then(invalidate),
          ),
        });
      },
    }),
  );
  const progress = progressText(job.progress, job.rooms.length);

  return (
    <>
      {/* A job with rooms says how it's going room by room; one without has its status in the
          summary strip, so it has no panel of its own (OD-129, Q181). */}
      {job.rooms.length > 0 ? (
        <Panel aria-labelledby="job-progress">
          <h2 id="job-progress" className="text-2xl">
            How it&apos;s going
          </h2>
          {/* The badge lives in the summary strip; here it's the rooms that say why.
            How it's going and its rooms in one place (OD-120, Q148). The tape only once
            something is done; at 0% it was the loudest thing on the page (Q149). */}
          {job.rooms.length > 0 ? (
            <>
              {job.progress.done > 0 ? (
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
                <p className="mt-2 text-muted-foreground tabular-nums">{progress}</p>
              )}
              <ul className="mt-2 divide-y divide-border">
                {job.rooms.map((r) => (
                  <li key={r.id} className="py-3 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <Link
                          to="/rooms/$roomId"
                          params={{ roomId: r.room.id }}
                          className="inline-flex min-h-11 items-center text-lg font-semibold underline-offset-4 hover:underline"
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
            </>
          ) : null}
        </Panel>
      ) : null}

      <Panel aria-labelledby="job-spec">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 id="job-spec" className="text-2xl">
            Spec
          </h2>
          {job.spec ? null : (
            // An empty section is one line with its Add button (OD-120, Q148).
            <>
              <span className="text-muted-foreground">
                {canEdit ? 'Not added yet' : 'None yet'}
              </span>
              {canEdit ? (
                <Button type="button" variant="outline" onClick={onEditJob}>
                  <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
                  Add a spec
                </Button>
              ) : null}
            </>
          )}
        </div>
        {job.spec ? <p className="mt-3 max-w-prose whitespace-pre-wrap">{job.spec}</p> : null}
        {job.notes ? (
          <>
            <h3 className="mt-5 text-lg">Notes</h3>
            <p className="mt-1 max-w-prose text-muted-foreground whitespace-pre-wrap">
              {job.notes}
            </p>
          </>
        ) : null}
      </Panel>

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
