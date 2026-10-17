import { Pencil, Plus, TriangleAlert } from 'lucide-react';
import { UnsavedGuard } from '@/components/unsaved-guard';
import { useFocusFirstField, useReturnFocus } from '@/lib/editor-focus';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  PHASE_STATUSES,
  phaseCreateSchema,
  phaseUpdateSchema,
  type PhaseCreate,
  type PhaseCreateInput,
  type PhaseStatusInput,
} from '@reparo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, FormError, Input, Select, Textarea } from '@/components/form';
import { useMe } from '@/lib/me';
import { problemWith } from '@/lib/problem';
import { trpcClient, useTRPC } from '@/lib/trpc';
import {
  PHASE_STATUS_LABEL,
  openJobsText,
  phaseDates,
  phaseMoneyEffect,
  phaseProgressText,
  type Phase,
} from '@/lib/work';
import { Link } from '@tanstack/react-router';
import { useToasts } from '@/lib/toasts';
import { money, plannedPhaseText } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { AutoSaveField } from '@/components/auto-save-field';
import { AutoSaveSelect } from '@/components/auto-save-select';
import { EditPanel } from '@/components/edit-panel';
import { PanelNameField } from '@/components/panel-name-field';
import { PanelList } from '@/components/panel';
import { PhaseStatusBadge, PhaseStatusSelect, StatusBadge } from '@/components/status';
import { SaveState } from '@/components/save-state';
import { TapeStrip } from '@/components/tape';
import { ListPlaceholder } from '@/components/placeholder';
import { LoadError } from '@/components/load-error';
import { MoveButtons } from '@/components/move-buttons';
import { useRefreshPhases } from '@/lib/refresh';

/** Phases of the renovation (ADR-009). A list for now; the phase dashboard is M4. */
export function Phases() {
  const trpc = useTRPC();
  const { isAdmin } = useMe();
  const phases = useQuery(trpc.phases.list.queryOptions());
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  useReturnFocus(adding ? 'add-phase' : editingId ? `phase-${editingId}` : null);
  const invalidate = useRefreshPhases();
  const create = useMutation(
    trpc.phases.create.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setAdding(false);
      },
    }),
  );
  const editingPhase = phases.data?.find((p) => p.id === editingId);
  const [arranging, setArranging] = useState(false);
  const move = useMutation(trpc.phases.move.mutationOptions({ onSuccess: () => invalidate() }));

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        title="Phases"
        description="The renovation in stages. Work and money belong to a phase."
        action={
          isAdmin ? (
            <div className="flex flex-wrap gap-2">
              {phases.data && phases.data.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  aria-pressed={arranging}
                  onClick={() => setArranging((v) => !v)}
                >
                  {arranging ? 'Done' : 'Change order'}
                </Button>
              ) : null}
              <Button type="button" onClick={() => setAdding(true)} data-return-focus="add-phase">
                <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
                Add a phase
              </Button>
            </div>
          ) : null
        }
      />

      <EditPanel
        open={adding}
        title="New phase"
        onClose={() => {
          create.reset();
          setAdding(false);
        }}
      >
        <PhaseForm
          idPrefix="new-phase"
          submitLabel="Add phase"
          serverError={create.error?.message}
          onCancel={() => {
            create.reset();
            setAdding(false);
          }}
          onSubmit={async (values) => {
            await create.mutateAsync(values).catch(() => undefined);
          }}
        />
      </EditPanel>
      {/* Edited in place: every change saves as it's made (OD-89). */}
      <EditPanel
        open={editingPhase !== undefined}
        title={editingPhase?.name ?? 'Phase'}
        focusFirstField={false}
        heading={
          editingPhase ? <PhaseNameField key={editingPhase.id} phase={editingPhase} /> : undefined
        }
        onClose={() => setEditingId(null)}
      >
        {editingPhase ? <PhasePanelBody key={editingPhase.id} phase={editingPhase} /> : null}
      </EditPanel>

      {phases.isPending ? <ListPlaceholder label="Loading phases" rows={3} /> : null}
      {phases.error ? <LoadError what="the phases" error={phases.error} retry={[phases]} /> : null}
      {phases.data && phases.data.length === 0 ? (
        <p className="text-muted-foreground">
          No phases yet.{isAdmin ? ' Add the first one above.' : ''}
        </p>
      ) : null}
      {phases.data && phases.data.length > 0 ? (
        <PanelList>
          {phases.data.map((phase, index) =>
            arranging ? (
              // Putting the phases in order: each row moves up or down (OD-117, Q141).
              <li
                key={phase.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-5"
              >
                <h2 className="text-2xl">{phase.name}</h2>
                <MoveButtons
                  id={phase.id}
                  name={phase.name}
                  index={index}
                  count={phases.data.length}
                  disabled={move.isPending}
                  onMove={(by) => move.mutateAsync({ id: phase.id, by }).catch(() => undefined)}
                />
              </li>
            ) : (
              // The id is where Money's By phase links land (OD-121, Q152).
              <li
                key={phase.id}
                id={`phase-${phase.id}`}
                className="flex scroll-mt-24 flex-col gap-3 px-4 py-4 sm:px-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <h2 className="text-2xl">{phase.name}</h2>
                    {isAdmin ? (
                      <PhaseStatus phase={phase} />
                    ) : (
                      <PhaseStatusBadge status={phase.status} />
                    )}
                    {/* What the status does to the money (OD-122, Q154). */}
                    <span className="text-sm text-muted-foreground">
                      {phaseMoneyEffect(phase.status)}
                    </span>
                  </div>
                  {isAdmin ? (
                    <Button
                      type="button"
                      onClick={() => setEditingId(phase.id)}
                      data-return-focus={`phase-${phase.id}`}
                      variant="ghost"
                    >
                      <Pencil aria-hidden absoluteStrokeWidth strokeWidth={2} />
                      Edit
                    </Button>
                  ) : null}
                </div>
                {phase.startsOn || phase.endsOn ? (
                  <p className="text-sm text-muted-foreground">{phaseDates(phase)}</p>
                ) : null}
                <div className="grid grid-cols-1 items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
                  {phase.progress.total > 0 ? (
                    <TapeStrip
                      mode="progress"
                      size="sm"
                      done={phase.progress.done}
                      total={phase.progress.total}
                      label={`${phase.name}: ${phaseProgressText(phase.progress)}`}
                    />
                  ) : null}
                  {/* The count links to the phase's jobs (OD-122, Q156). */}
                  {phase.progress.total > 0 ? (
                    <Link
                      to="/jobs"
                      search={{ phase: phase.id }}
                      className="inline-flex min-h-11 items-center text-sm text-foreground tabular-nums underline underline-offset-4"
                    >
                      {phaseProgressText(phase.progress)}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {phaseProgressText(phase.progress)}
                    </span>
                  )}
                </div>
                <OpenJobsWarning phase={phase} />
                <PhaseMoney phase={phase} />
                {phase.notes ? (
                  <p className="max-w-prose text-muted-foreground whitespace-pre-wrap">
                    {phase.notes}
                  </p>
                ) : null}
              </li>
            ),
          )}
        </PanelList>
      ) : null}
      {move.error ? <FormError>{move.error.message}</FormError> : null}
    </section>
  );
}

type FormProps = {
  phase?: Phase;
  onSubmit: (values: PhaseCreate) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  serverError?: string | undefined;
  idPrefix: string;
};

function PhaseForm({ phase, onSubmit, onCancel, submitLabel, serverError, idPrefix }: FormProps) {
  const { register, handleSubmit, formState } = useForm<PhaseCreateInput, unknown, PhaseCreate>({
    resolver: zodResolver(phaseCreateSchema),
    defaultValues: {
      name: phase?.name ?? '',
      status: phase?.status ?? 'planned',
      startsOn: phase?.startsOn ?? null,
      endsOn: phase?.endsOn ?? null,
      notes: phase?.notes ?? '',
    },
  });
  const errors = formState.errors;
  const id = (f: string) => `${idPrefix}-${f}`;
  // Date inputs give '' when cleared; the schema wants null for "no date".
  const date = (name: 'startsOn' | 'endsOn') =>
    register(name, { setValueAs: (v: unknown) => (v === '' ? null : v) });

  const formRef = useFocusFirstField<HTMLFormElement>();
  return (
    <form ref={formRef} onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-5">
      <div className="grid gap-5">
        <Field label="Name" htmlFor={id('name')} error={errors.name?.message}>
          <Input id={id('name')} autoComplete="off" {...register('name')} />
        </Field>
        <Field label="Status" htmlFor={id('status')} error={errors.status?.message}>
          <Select id={id('status')} {...register('status')}>
            {PHASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PHASE_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-5">
        <Field label="Starts" htmlFor={id('starts')} error={errors.startsOn?.message}>
          <Input id={id('starts')} type="date" className="max-w-48" {...date('startsOn')} />
        </Field>
        <Field label="Ends" htmlFor={id('ends')} error={errors.endsOn?.message}>
          <Input id={id('ends')} type="date" className="max-w-48" {...date('endsOn')} />
        </Field>
      </div>
      <Field label="Notes" htmlFor={id('notes')} error={errors.notes?.message}>
        <Textarea id={id('notes')} rows={3} {...register('notes')} />
      </Field>
      {serverError ? <FormError>{serverError}</FormError> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={formState.isSubmitting}>
          {submitLabel}
        </Button>
        <Button type="button" onClick={onCancel} variant="ghost">
          Cancel
        </Button>
      </div>
      <UnsavedGuard
        when={formState.isDirty && !formState.isSubmitting && !formState.isSubmitSuccessful}
      />
    </form>
  );
}

/**
 * A phase's status for the admin: changes save at once, with Saving / Saved / Couldn't save
 * beside it (OD-77). Starting or finishing a phase moves the money, so Home and Money refresh.
 */
function PhaseStatus({ phase }: { phase: Phase }) {
  const trpc = useTRPC();
  const refresh = useRefreshPhases();
  const announce = useAnnounceStatus();
  const before = phase.status;
  const save = useMutation(
    trpc.phases.update.mutationOptions({
      onSuccess: async (_d, vars) => {
        await refresh();
        if (vars.status) announce(phase, before, vars.status);
      },
    }),
  );
  const what = `Status of ${phase.name}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <PhaseStatusSelect
        id={`phase-status-${phase.id}`}
        label={what}
        value={(save.isPending ? save.variables.status : undefined) ?? phase.status}
        onChange={(status) => save.mutate({ id: phase.id, status })}
      />
      <SaveState
        mutation={save}
        what={what}
        onRetry={() => save.mutate(save.variables ?? { id: phase.id })}
      />
    </span>
  );
}

/**
 * After a phase's status changes: what it now does to the money, a warning when it's marked
 * complete with jobs still open, and Undo for 10 seconds (OD-122, Q154).
 */
function useAnnounceStatus() {
  const toasts = useToasts();
  const refresh = useRefreshPhases();
  return (phase: Phase, was: PhaseStatusInput, now: PhaseStatusInput) => {
    if (was === now) return;
    const open = now === 'complete' ? openJobsText(phase.progress) : null;
    toasts.add({
      title: `${phase.name} is now ${PHASE_STATUS_LABEL[now].toLowerCase()}`,
      description: open ? `${open}. ${phaseMoneyEffect(now)}.` : `${phaseMoneyEffect(now)}.`,
      timeout: 10_000,
      actionProps: {
        children: 'Undo',
        onClick: () =>
          void trpcClient.phases.update
            .mutate({ id: phase.id, status: was })
            .then(refresh)
            .catch(() => undefined),
      },
    });
  };
}

/** A complete phase that still has open jobs says so, in the list and its panel (Q154). */
function OpenJobsWarning({ phase }: { phase: Phase }) {
  const open = phase.status === 'complete' ? openJobsText(phase.progress) : null;
  if (!open) return null;
  return (
    <p className="flex items-start gap-2 text-sm">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>Marked complete, but {open}.</span>
    </p>
  );
}

/**
 * A phase's money (OD-123, Q155), the same figures as Money's By phase: spent and still to
 * come, and for a phase that isn't counted yet what it would leave, in red when it's short.
 */
function PhaseMoney({ phase }: { phase: Phase }) {
  const m = phase.money;
  const planned =
    m.leavesCents !== null
      ? plannedPhaseText({
          name: phase.name,
          toComeCents: m.toComeCents,
          leavesCents: m.leavesCents,
        })
      : null;
  return (
    <div className="flex flex-col gap-1">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
        <div className="flex items-baseline gap-2">
          <dt className="text-sm text-muted-foreground">Spent</dt>
          <dd className="font-semibold">{money(m.spentCents)}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-sm text-muted-foreground">Planned</dt>
          <dd className="font-semibold">{money(m.toComeCents)}</dd>
        </div>
      </dl>
      {planned && planned.amount ? (
        <p className="text-sm text-muted-foreground tabular-nums">
          {planned.text}
          <span
            className={cn('font-semibold', planned.short ? 'text-destructive' : 'text-foreground')}
          >
            {planned.amount}
          </span>
          .
        </p>
      ) : null}
    </div>
  );
}

/** The phase's jobs with their status, in its panel (OD-122, Q156). */
function PhaseJobs({ phase }: { phase: Phase }) {
  const trpc = useTRPC();
  const jobs = useQuery(trpc.jobs.list.queryOptions({ phaseId: phase.id }));
  return (
    <section aria-labelledby={`phase-${phase.id}-jobs`} className="flex flex-col gap-2">
      <h3 id={`phase-${phase.id}-jobs`} className="text-base font-semibold">
        Its jobs
      </h3>
      {jobs.isPending ? <p className="text-muted-foreground">Loading its jobs…</p> : null}
      {jobs.error ? <LoadError what="its jobs" error={jobs.error} retry={[jobs]} /> : null}
      {jobs.data && jobs.data.length === 0 ? (
        <p className="text-muted-foreground">No jobs yet.</p>
      ) : null}
      {jobs.data && jobs.data.length > 0 ? (
        <ul className="divide-y divide-border border-y border-border">
          {jobs.data.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <Link
                to="/jobs/$jobId"
                params={{ jobId: j.id }}
                className="inline-flex min-h-11 min-w-0 items-center font-semibold break-words underline underline-offset-4 hover:decoration-2"
              >
                {j.name}
              </Link>
              <StatusBadge status={j.progress.status} />
            </li>
          ))}
        </ul>
      ) : null}
      {jobs.data && jobs.data.length > 0 ? (
        <Link
          to="/jobs"
          search={{ phase: phase.id }}
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          See them on the Jobs page
        </Link>
      ) : null}
    </section>
  );
}

type PhasePatch = Omit<Parameters<typeof trpcClient.phases.update.mutate>[0], 'id'>;

/** Save part of a phase, then refresh everything that shows phases. */
function useSavePhase(id: string) {
  const refresh = useRefreshPhases();
  return async (patch: PhasePatch) => {
    await trpcClient.phases.update.mutate({ id, ...patch });
    await refresh();
  };
}

function PhaseNameField({ phase }: { phase: Phase }) {
  const save = useSavePhase(phase.id);
  return (
    <PanelNameField
      id={`phase-name-${phase.id}`}
      initial={phase.name}
      what={`Name of ${phase.name}`}
      validate={(v) => problemWith(phaseUpdateSchema.shape.name, v)}
      onSave={(v) => save({ name: v })}
    />
  );
}

/**
 * A phase edited in place (OD-89): status saves when picked; dates, order and notes when you
 * leave them. An empty date means "no date".
 */
function PhasePanelBody({ phase }: { phase: Phase }) {
  const save = useSavePhase(phase.id);
  const announce = useAnnounceStatus();
  const id = (f: string) => `phase-${phase.id}-${f}`;
  const date = (v: string) => (v === '' ? null : v);
  return (
    <div className="flex flex-col gap-4">
      <AutoSaveSelect
        id={id('status')}
        label="Status"
        hint={phaseMoneyEffect(phase.status)}
        value={phase.status}
        options={PHASE_STATUSES.map((st) => ({ value: st, label: PHASE_STATUS_LABEL[st] }))}
        what={`Status of ${phase.name}`}
        onSave={async (v) => {
          const was = phase.status;
          const now = v as PhaseStatusInput;
          await save({ status: now });
          announce(phase, was, now);
        }}
      />
      <OpenJobsWarning phase={phase} />
      <AutoSaveField
        id={id('starts')}
        label="Starts"
        type="date"
        inputClassName="max-w-48"
        initial={phase.startsOn ?? ''}
        what={`Start of ${phase.name}`}
        validate={(v) => problemWith(phaseUpdateSchema.shape.startsOn, date(v))}
        onSave={(v) => save({ startsOn: date(v) })}
      />
      <AutoSaveField
        id={id('ends')}
        label="Ends"
        type="date"
        inputClassName="max-w-48"
        initial={phase.endsOn ?? ''}
        what={`End of ${phase.name}`}
        validate={(v) => problemWith(phaseUpdateSchema.shape.endsOn, date(v))}
        onSave={(v) => save({ endsOn: date(v) })}
      />
      <AutoSaveField
        id={id('notes')}
        label="Notes"
        multiline
        initial={phase.notes}
        what={`Notes for ${phase.name}`}
        validate={(v) => problemWith(phaseUpdateSchema.shape.notes, v)}
        onSave={(v) => save({ notes: v })}
      />
      <PhaseJobs phase={phase} />
    </div>
  );
}
