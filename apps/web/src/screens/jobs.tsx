import { useReturnFocus } from '@/lib/editor-focus';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { EditPanel } from '@/components/edit-panel';
import { PageHeader } from '@/components/page-header';
import { PanelList } from '@/components/panel';
import { PlanGrid } from '@/components/plan-grid';
import { PhaseStatusBadge, StatusBadge } from '@/components/status';
import { TapeStrip } from '@/components/tape';
import { Button, buttonVariants } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { money } from '@/lib/money';
import { useTRPC } from '@/lib/trpc';
import { groupByPhase, progressText, type Job } from '@/lib/work';
import { JobEditor } from './job-editor';
import { ListPlaceholder } from '@/components/placeholder';
import { LoadError } from '@/components/load-error';

/**
 * Every job, phase by phase (M2, OD-46). Replaces the Items page: a job is a named task in a
 * phase, with an optional vendor and the rooms it covers. "Add a job" lives here.
 */
export function Jobs() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { canEdit } = useMe();
  const jobs = useQuery(trpc.jobs.list.queryOptions());
  const phases = useQuery(trpc.phases.list.queryOptions());
  const [adding, setAdding] = useState(false);
  useReturnFocus(adding ? 'add-job' : null);

  const search = useSearch({ from: '/_app/jobs/' });
  const all = jobs.data && phases.data ? groupByPhase(phases.data, jobs.data) : null;
  // `?phase=` shows one phase's jobs, from the Phases page (OD-122, Q156).
  const onePhase = search.phase ? phases.data?.find((p) => p.id === search.phase) : undefined;
  const groups = all && onePhase ? all.filter((g) => g.phase.id === onePhase.id) : all;

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        title="Jobs"
        description={
          <>
            The work, phase by phase. Each job says who&apos;s doing it and which rooms it covers.
          </>
        }
        action={
          // Vendors sits beside Add a job, not wrapped under the description (OD-129, Q184).
          <div className="flex flex-wrap gap-2">
            <Link to="/vendors" className={buttonVariants({ variant: 'outline' })}>
              See all vendors
            </Link>
            {canEdit ? (
              <Button type="button" onClick={() => setAdding(true)} data-return-focus="add-job">
                <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
                Add a job
              </Button>
            ) : null}
          </div>
        }
      />

      <EditPanel open={adding} title="New job" onClose={() => setAdding(false)}>
        <JobEditor
          idPrefix="new-job"
          onCancel={() => setAdding(false)}
          onSaved={(jobId) => void navigate({ to: '/jobs/$jobId', params: { jobId } })}
        />
      </EditPanel>

      {jobs.isPending || phases.isPending ? (
        <ListPlaceholder label="Loading jobs" rows={6} />
      ) : null}
      {jobs.error || phases.error ? (
        <LoadError what="the jobs" error={jobs.error ?? phases.error} retry={[jobs, phases]} />
      ) : null}
      {onePhase ? (
        <p className="-mt-4 text-muted-foreground">
          Showing {onePhase.name}&apos;s jobs.{' '}
          <Link to="/jobs" className="text-foreground underline underline-offset-4">
            Show every phase
          </Link>
        </p>
      ) : null}
      {onePhase && groups && groups.length === 0 ? (
        <p className="text-muted-foreground">{onePhase.name} has no jobs yet.</p>
      ) : null}
      {!onePhase && groups && groups.length === 0 ? (
        <PlanGrid className="h-56 flex-col gap-3 rounded-xl text-base">
          <span>No jobs yet.</span>
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdding(true)}
              data-return-focus="add-job"
            >
              <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
              Add the first job
            </Button>
          ) : null}
        </PlanGrid>
      ) : null}
      {groups?.map(({ phase, jobs: inPhase }) => (
        <section key={phase.id} aria-labelledby={`phase-${phase.id}`}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 id={`phase-${phase.id}`} className="text-2xl">
              {phase.name}
            </h2>
            <PhaseStatusBadge status={phase.status} />
          </div>
          <PanelList className="mt-3">
            {inPhase.map((job) => (
              <li key={job.id}>
                <JobRow job={job} />
              </li>
            ))}
          </PanelList>
        </section>
      ))}
    </section>
  );
}

/**
 * One job: name and vendor on the left; the price in a right-aligned column at 20px with what's
 * paid beneath it, so prices can be scanned down the list like Shopping's (OD-91); then where
 * the work stands. On a phone the price sits above the status, at the right.
 */
function JobRow({ job }: { job: Job }) {
  const progress = progressText(job.progress, job.rooms.length);
  const priced = job.money.costCents > 0;
  return (
    <Link
      to="/jobs/$jobId"
      params={{ jobId: job.id }}
      className="flex min-h-16 items-center gap-4 px-4 py-3 hover:bg-accent sm:px-5"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-semibold break-words">{job.name}</span>
        <span className="block text-sm text-muted-foreground">
          {job.vendor ? job.vendor.name : 'No vendor yet'}
        </span>
        {job.estimates.total > 0 && !job.estimates.chosen ? (
          <span className="block text-sm font-semibold">
            {job.estimates.total === 1 ? '1 estimate' : `${job.estimates.total} estimates`}, none
            chosen
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-6">
        <span className="flex flex-col items-end tabular-nums sm:w-36">
          {priced ? (
            <>
              <span className="text-xl font-semibold whitespace-nowrap">
                {money(job.money.costCents)}
              </span>
              {/* "$0.00 paid" said nothing; only once something is paid (OD-120, Q149). */}
              {job.money.paidCents > 0 ? (
                <span className="text-sm whitespace-nowrap text-muted-foreground">
                  {money(job.money.paidCents)} paid
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">No price yet</span>
          )}
        </span>
        <span className="flex w-28 flex-col items-end gap-1 sm:w-56">
          {job.rooms.length > 0 ? (
            <>
              <TapeStrip
                mode="progress"
                size="sm"
                done={job.progress.done}
                total={job.progress.total}
                label={`${job.name}: ${progress}`}
                className="hidden w-full sm:block"
              />
              <span className="text-right text-sm text-muted-foreground tabular-nums">
                {progress}
              </span>
            </>
          ) : (
            <StatusBadge status={job.progress.status} />
          )}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
