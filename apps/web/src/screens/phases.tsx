import { Pencil, Plus } from 'lucide-react';
import { UnsavedGuard } from '@/components/unsaved-guard';
import { useFocusFirstField, useReturnFocus } from '@/lib/editor-focus';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  PHASE_STATUSES,
  phaseCreateSchema,
  phaseUpdateSchema,
  type PhaseCreate,
  type PhaseCreateInput,
} from '@reparo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, FormError, Input, Select, Textarea } from '@/components/form';
import { useMe } from '@/lib/me';
import { problemWith } from '@/lib/problem';
import { trpcClient, useTRPC } from '@/lib/trpc';
import { PHASE_STATUS_LABEL, phaseDates, phaseProgressText, type Phase } from '@/lib/work';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { AutoSaveField } from '@/components/auto-save-field';
import { AutoSaveSelect } from '@/components/auto-save-select';
import { EditPanel } from '@/components/edit-panel';
import { PanelNameField } from '@/components/panel-name-field';
import { PanelList } from '@/components/panel';
import { PhaseStatusBadge, PhaseStatusSelect } from '@/components/status';
import { SaveState } from '@/components/save-state';
import { TapeStrip } from '@/components/tape';
import { ListPlaceholder } from '@/components/placeholder';
import { LoadError } from '@/components/load-error';

/** Phases of the renovation (ADR-009). A list for now; the phase dashboard is M4. */
export function Phases() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { isAdmin } = useMe();
  const phases = useQuery(trpc.phases.list.queryOptions());
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  useReturnFocus(adding ? 'add-phase' : editingId ? `phase-${editingId}` : null);
  const invalidate = () => queryClient.invalidateQueries(trpc.phases.pathFilter());
  const create = useMutation(
    trpc.phases.create.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setAdding(false);
      },
    }),
  );
  const editingPhase = phases.data?.find((p) => p.id === editingId);

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        title="Phases"
        description="The renovation in stages. Work and money belong to a phase."
        action={
          isAdmin ? (
            <Button type="button" onClick={() => setAdding(true)} data-return-focus="add-phase">
              <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
              Add a phase
            </Button>
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
          {phases.data.map((phase) => (
            <li key={phase.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <h2 className="text-2xl">{phase.name}</h2>
                  {isAdmin ? (
                    <PhaseStatus phase={phase} />
                  ) : (
                    <PhaseStatusBadge status={phase.status} />
                  )}
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
                <span className="text-sm text-muted-foreground tabular-nums">
                  {phaseProgressText(phase.progress)}
                </span>
              </div>
              {phase.notes ? (
                <p className="max-w-prose text-muted-foreground whitespace-pre-wrap">
                  {phase.notes}
                </p>
              ) : null}
            </li>
          ))}
        </PanelList>
      ) : null}
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
      sortOrder: phase?.sortOrder ?? 0,
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
        <Field label="Order" htmlFor={id('order')} error={errors.sortOrder?.message}>
          <Input
            id={id('order')}
            className="max-w-48"
            type="number"
            min={0}
            step={1}
            {...register('sortOrder', { valueAsNumber: true })}
          />
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
  const queryClient = useQueryClient();
  const save = useMutation(
    trpc.phases.update.mutationOptions({
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries(trpc.phases.pathFilter()),
          queryClient.invalidateQueries(trpc.money.pathFilter()),
          queryClient.invalidateQueries(trpc.home.pathFilter()),
          queryClient.invalidateQueries(trpc.shoppingLines.pathFilter()),
        ]),
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

type PhasePatch = Omit<Parameters<typeof trpcClient.phases.update.mutate>[0], 'id'>;

/** Save part of a phase, then refresh everything that shows phases. */
function useSavePhase(id: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async (patch: PhasePatch) => {
    await trpcClient.phases.update.mutate({ id, ...patch });
    await Promise.all([
      queryClient.invalidateQueries(trpc.phases.pathFilter()),
      queryClient.invalidateQueries(trpc.jobs.pathFilter()),
      queryClient.invalidateQueries(trpc.money.pathFilter()),
      queryClient.invalidateQueries(trpc.home.pathFilter()),
    ]);
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
  const id = (f: string) => `phase-${phase.id}-${f}`;
  const date = (v: string) => (v === '' ? null : v);
  return (
    <div className="flex flex-col gap-4">
      <AutoSaveSelect
        id={id('status')}
        label="Status"
        value={phase.status}
        options={PHASE_STATUSES.map((st) => ({ value: st, label: PHASE_STATUS_LABEL[st] }))}
        what={`Status of ${phase.name}`}
        onSave={(v) => save({ status: v as PhasePatch['status'] })}
      />
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
        id={id('order')}
        label="Order"
        hint="Lower comes first."
        inputMode="numeric"
        inputClassName="max-w-48"
        initial={String(phase.sortOrder)}
        what={`Order of ${phase.name}`}
        validate={(v) => problemWith(phaseUpdateSchema.shape.sortOrder, Number(v))}
        onSave={(v) => save({ sortOrder: Number(v) })}
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
    </div>
  );
}
