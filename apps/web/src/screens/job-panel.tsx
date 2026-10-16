import { jobUpdateSchema } from '@reparo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AutoSaveField } from '@/components/auto-save-field';
import { AutoSaveSelect } from '@/components/auto-save-select';
import { PanelNameField } from '@/components/panel-name-field';
import { FormPlaceholder } from '@/components/placeholder';
import { SaveProblem, SaveStatus } from '@/components/save-state';
import { Button } from '@/components/ui/button';
import { VendorPicker } from '@/components/vendor-picker';
import { listText } from '@/lib/money';
import { problemWith } from '@/lib/problem';
import { trpcClient, useTRPC } from '@/lib/trpc';
import { vendorOptions } from '@/lib/vendors';
import { PHASE_STATUS_LABEL, type Job } from '@/lib/work';

type JobPatch = Omit<Parameters<typeof trpcClient.jobs.update.mutate>[0], 'id'>;

/** Save part of a job, then refresh everything that shows it. */
function useSaveJob(id: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async (patch: JobPatch) => {
    await trpcClient.jobs.update.mutate({ id, ...patch });
    await Promise.all([
      queryClient.invalidateQueries(trpc.jobs.pathFilter()),
      queryClient.invalidateQueries(trpc.vendors.pathFilter()),
      queryClient.invalidateQueries(trpc.home.pathFilter()),
    ]);
  };
}

/** The job's name as the panel's heading, editable in place (OD-89). */
export function JobNameField({ job }: { job: Job }) {
  const save = useSaveJob(job.id);
  return (
    <PanelNameField
      id={`job-name-${job.id}`}
      initial={job.name}
      what={`Name of ${job.name}`}
      validate={(v) => problemWith(jobUpdateSchema.shape.name, v)}
      onSave={(v) => save({ name: v })}
    />
  );
}

/**
 * A job edited in place (Workflow polish, OD-89; like the shopping panel, OD-82): phase and
 * vendor save when picked, spec and notes when you leave them, and a room is added the moment
 * it's ticked. Taking rooms off asks first, because it removes their status and spec for this
 * job. A new job still uses JobEditor's form with its Add button.
 */
export function JobPanelBody({ job }: { job: Job }) {
  const trpc = useTRPC();
  const save = useSaveJob(job.id);
  const phases = useQuery(trpc.phases.list.queryOptions());
  const rooms = useQuery(trpc.rooms.list.queryOptions());
  const vendors = useQuery(trpc.vendors.list.queryOptions());
  const estimates = useQuery({
    ...trpc.estimates.list.queryOptions({ jobId: job.id }),
    enabled: job.estimates.chosen,
  });
  const vendor = useMutation({ mutationFn: (vendorId: string | null) => save({ vendorId }) });

  if (phases.isPending || rooms.isPending || vendors.isPending) {
    return <FormPlaceholder label="Loading the job" fields={5} />;
  }
  if (phases.error || rooms.error || vendors.error) {
    const message = (phases.error ?? rooms.error ?? vendors.error)?.message;
    return <p role="alert">Couldn&apos;t load: {message}</p>;
  }

  const id = (f: string) => `job-${job.id}-${f}`;
  const shownVendor = vendor.isPending ? (vendor.variables ?? null) : job.vendorId;
  const chosenVendorId = estimates.data?.find((e) => e.status === 'chosen')?.vendor.id ?? null;
  const vendorHint =
    chosenVendorId !== null && shownVendor === chosenVendorId
      ? "From the chosen estimate. Choosing another estimate changes who's doing it."
      : "Who's doing it. Search by name or what they do, or type a new name to add them. Leave empty for work you do yourselves.";

  return (
    <div className="flex flex-col gap-4">
      <AutoSaveSelect
        id={id('phase')}
        label="Phase"
        value={job.phaseId}
        options={phases.data.map((p) => ({
          value: p.id,
          label: `${p.name} (${PHASE_STATUS_LABEL[p.status].toLowerCase()})`,
        }))}
        what={`Phase of ${job.name}`}
        onSave={(phaseId) => save({ phaseId })}
      />

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id('vendor')} className="block text-sm font-semibold">
            Vendor
          </label>
          <SaveStatus mutation={vendor} what={`Vendor for ${job.name}`} />
        </div>
        <div className="mt-1.5">
          <VendorPicker
            id={id('vendor')}
            value={shownVendor}
            onChange={(v) => {
              if (v !== job.vendorId) vendor.mutate(v);
            }}
            vendors={vendorOptions(vendors.data, job.vendor)}
            aria-describedby={`${id('vendor')}-hint`}
          />
        </div>
        {vendor.status === 'error' ? (
          <SaveProblem mutation={vendor} onRetry={() => vendor.mutate(vendor.variables ?? null)} />
        ) : (
          <p id={`${id('vendor')}-hint`} className="mt-1.5 text-sm text-muted-foreground">
            {vendorHint}
          </p>
        )}
      </div>

      <AutoSaveField
        id={id('spec')}
        label="Spec"
        hint="What's being done, the same in every room unless a room says otherwise: product, colour, finish, size."
        multiline
        rows={4}
        initial={job.spec}
        what={`Spec for ${job.name}`}
        validate={(v) => problemWith(jobUpdateSchema.shape.spec, v)}
        onSave={(v) => save({ spec: v })}
      />
      <AutoSaveField
        id={id('notes')}
        label="Notes"
        multiline
        rows={2}
        initial={job.notes}
        what={`Notes for ${job.name}`}
        validate={(v) => problemWith(jobUpdateSchema.shape.notes, v)}
        onSave={(v) => save({ notes: v })}
      />

      <JobRooms job={job} rooms={rooms.data} />
    </div>
  );
}

type Change = { add: string[]; remove: { roomId: string; jobRoomId: string }[] };

/**
 * The rooms a job covers. Ticking adds a room at once (it starts Unstarted). Unticking, or
 * None, asks first: taking a room off removes its status and spec for this job.
 */
function JobRooms({ job, rooms }: { job: Job; rooms: { id: string; name: string }[] }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<Change['remove'] | null>(null);
  const change = useMutation({
    mutationFn: async ({ add, remove }: Change) => {
      for (const roomId of add) await trpcClient.jobRooms.create.mutate({ jobId: job.id, roomId });
      for (const r of remove) await trpcClient.jobRooms.remove.mutate({ id: r.jobRoomId });
      await Promise.all([
        queryClient.invalidateQueries(trpc.jobs.pathFilter()),
        queryClient.invalidateQueries(trpc.rooms.pathFilter()),
        queryClient.invalidateQueries(trpc.home.pathFilter()),
      ]);
    },
  });
  const onJob = new Map(job.rooms.map((r) => [r.roomId, r.id]));
  // While a change saves, show it as done.
  const picked = new Set(onJob.keys());
  if (change.isPending && change.variables) {
    change.variables.add.forEach((r) => picked.add(r));
    change.variables.remove.forEach((r) => picked.delete(r.roomId));
  }
  const nameOf = (roomId: string) => rooms.find((r) => r.id === roomId)?.name ?? 'that room';
  const off = (roomIds: string[]) =>
    roomIds.flatMap((roomId) => {
      const jobRoomId = onJob.get(roomId);
      return jobRoomId ? [{ roomId, jobRoomId }] : [];
    });

  return (
    <fieldset>
      <legend className="sr-only">Rooms this job covers</legend>
      <div className="flex items-baseline justify-between gap-3">
        <span aria-hidden className="text-sm font-semibold">
          Rooms this job covers
        </span>
        <SaveStatus mutation={change} what={`Rooms for ${job.name}`} />
      </div>
      {rooms.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          No rooms yet. A job with no rooms (a fee, say) has its own status.
        </p>
      ) : (
        <>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={change.isPending}
              onClick={() =>
                change.mutate({
                  add: rooms.map((r) => r.id).filter((r) => !onJob.has(r)),
                  remove: [],
                })
              }
            >
              All rooms
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={change.isPending || onJob.size === 0}
              onClick={() => setAsking(off([...onJob.keys()]))}
            >
              None
            </Button>
          </div>
          {asking && asking.length > 0 ? (
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
              <p>
                Take {listText(asking.map((r) => nameOf(r.roomId)))} off {job.name}?{' '}
                {asking.length === 1 ? 'Its' : 'Their'} status and spec for this job go.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    change.mutate({ add: [], remove: asking });
                    setAsking(null);
                  }}
                >
                  Yes, take {asking.length === 1 ? 'it' : 'them'} off
                </Button>
                <Button type="button" variant="ghost" onClick={() => setAsking(null)}>
                  Keep
                </Button>
              </div>
            </div>
          ) : null}
          <ul className="mt-3 grid">
            {rooms.map((r) => (
              <li key={r.id}>
                <label className="flex min-h-11 items-center gap-3 text-base">
                  <input
                    type="checkbox"
                    checked={picked.has(r.id)}
                    disabled={change.isPending}
                    onChange={(e) => {
                      if (e.target.checked) change.mutate({ add: [r.id], remove: [] });
                      else setAsking(off([r.id]));
                    }}
                    className="size-5 accent-primary"
                  />
                  {r.name}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {change.status === 'error' ? (
        <SaveProblem
          mutation={change}
          onRetry={() => {
            if (change.variables) change.mutate(change.variables);
          }}
        />
      ) : null}
    </fieldset>
  );
}
