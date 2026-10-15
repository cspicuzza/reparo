import { useReturnFocus } from '@/lib/editor-focus';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { EditPanel } from '@/components/edit-panel';
import { PageHeader } from '@/components/page-header';
import { PanelList } from '@/components/panel';
import { PlanGrid } from '@/components/plan-grid';
import { PhaseStatusBadge, StatusBadge } from '@/components/status';
import { TapeStrip } from '@/components/tape';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { money } from '@/lib/money';
import { useTRPC } from '@/lib/trpc';
import { groupByPhase, progressText, type Job } from '@/lib/work';
import { JobEditor } from './job-editor';

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

  const groups = jobs.data && phases.data ? groupByPhase(phases.data, jobs.data) : null;

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        title="Jobs"
        description={
          <>
            The work, phase by phase. Each job says who&apos;s doing it and which rooms it covers.{' '}
            <Link to="/vendors" className="text-foreground underline underline-offset-4">
              See all vendors
            </Link>
          </>
        }
        action={
          canEdit ? (
            <Button type="button" onClick={() => setAdding(true)} data-return-focus="add-job">
              <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
              Add a job
            </Button>
          ) : null
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
        <p className="text-muted-foreground">Loading jobs…</p>
      ) : null}
      {jobs.error || phases.error ? (
        <p role="alert">Couldn&apos;t load jobs: {(jobs.error ?? phases.error)?.message}</p>
      ) : null}
      {groups && groups.length === 0 ? (
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

function JobRow({ job }: { job: Job }) {
  const progress = progressText(job.progress, job.rooms.length);
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
        {job.money.costCents > 0 ? (
          <span className="block text-sm text-muted-foreground tabular-nums">
            Paid {money(job.money.paidCents)} of {money(job.money.costCents)}
          </span>
        ) : null}
        {job.estimates.total > 0 && !job.estimates.chosen ? (
          <span className="block text-sm font-semibold">
            {job.estimates.total === 1 ? '1 estimate' : `${job.estimates.total} estimates`}, none
            chosen
          </span>
        ) : null}
      </span>
      <span className="flex w-28 shrink-0 flex-col items-end gap-1 sm:w-56">
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
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
