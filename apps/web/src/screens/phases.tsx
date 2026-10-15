import { UnsavedGuard } from '@/components/unsaved-guard';
import { useFocusFirstField, useReturnFocus } from '@/lib/editor-focus';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  PHASE_STATUSES,
  phaseCreateSchema,
  type PhaseCreate,
  type PhaseCreateInput,
} from '@reparo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, FormError, Input, Select, Textarea } from '@/components/form';
import { useMe } from '@/lib/me';
import { useTRPC } from '@/lib/trpc';
import { PHASE_STATUS_LABEL, phaseDates, phaseProgressText, type Phase } from '@/lib/work';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { Panel, PanelList } from '@/components/panel';
import { PhaseStatusBadge } from '@/components/status';
import { TapeStrip } from '@/components/tape';

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
  const update = useMutation(
    trpc.phases.update.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setEditingId(null);
      },
    }),
  );

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        title="Phases"
        description="The renovation in stages. Work and money belong to a phase."
        action={
          isAdmin && !adding ? (
            <Button type="button" onClick={() => setAdding(true)} data-return-focus="add-phase">
              Add a phase
            </Button>
          ) : null
        }
      />

      {adding ? (
        <Panel aria-labelledby="new-phase">
          <h2 id="new-phase" className="text-2xl">
            New phase
          </h2>
          <div className="mt-4">
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
          </div>
        </Panel>
      ) : null}

      {phases.isPending ? <p className="text-muted-foreground">Loading phases…</p> : null}
      {phases.error ? <p role="alert">Couldn&apos;t load phases: {phases.error.message}</p> : null}
      {phases.data && phases.data.length === 0 && !adding ? (
        <p className="text-muted-foreground">
          No phases yet.{isAdmin ? ' Add the first one above.' : ''}
        </p>
      ) : null}
      {phases.data && phases.data.length > 0 ? (
        <PanelList>
          {phases.data.map((phase) =>
            editingId === phase.id ? (
              <li key={phase.id} className="p-4 sm:p-5">
                <PhaseForm
                  idPrefix={`phase-${phase.id}`}
                  phase={phase}
                  submitLabel="Save phase"
                  serverError={update.error?.message}
                  onCancel={() => {
                    update.reset();
                    setEditingId(null);
                  }}
                  onSubmit={async (values) => {
                    await update.mutateAsync({ id: phase.id, ...values }).catch(() => undefined);
                  }}
                />
              </li>
            ) : (
              <li key={phase.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <h2 className="text-2xl">{phase.name}</h2>
                    <PhaseStatusBadge status={phase.status} />
                  </div>
                  {isAdmin ? (
                    <Button
                      type="button"
                      onClick={() => {
                        update.reset();
                        setEditingId(phase.id);
                      }}
                      data-return-focus={`phase-${phase.id}`}
                      variant="ghost"
                    >
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
            ),
          )}
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
      <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
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
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Starts" htmlFor={id('starts')} error={errors.startsOn?.message}>
          <Input id={id('starts')} type="date" {...date('startsOn')} />
        </Field>
        <Field label="Ends" htmlFor={id('ends')} error={errors.endsOn?.message}>
          <Input id={id('ends')} type="date" {...date('endsOn')} />
        </Field>
        <Field label="Order" htmlFor={id('order')} error={errors.sortOrder?.message}>
          <Input
            id={id('order')}
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
