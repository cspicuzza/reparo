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
import { Field, Input, inputClass, Textarea } from '@/components/form';
import { useMe } from '@/lib/me';
import { useTRPC } from '@/lib/trpc';
import { PHASE_STATUS_LABEL, type Phase } from '@/lib/work';
import { Button } from '@/components/ui/button';

/** Phases of the renovation (ADR-009). A list for now; the phase dashboard is M4. */
export function Phases() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { isAdmin } = useMe();
  const phases = useQuery(trpc.phases.list.queryOptions());
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Phases</h1>
          <p className="mt-1 max-w-prose text-muted-foreground">
            The renovation in stages. Work and money belong to a phase.
          </p>
        </div>
        {isAdmin && !adding ? (
          <Button type="button" onClick={() => setAdding(true)}>
            Add a phase
          </Button>
        ) : null}
      </div>

      {adding ? (
        <div className="mt-8 rounded-lg border border-border p-5">
          <h2 className="text-lg font-medium">New phase</h2>
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
        </div>
      ) : null}

      <div className="mt-8">
        {phases.isPending ? <p className="text-muted-foreground">Loading phases…</p> : null}
        {phases.error ? (
          <p role="alert">Couldn&apos;t load phases: {phases.error.message}</p>
        ) : null}
        {phases.data ? (
          <ul className="divide-y divide-border border-t border-b border-border">
            {phases.data.map((phase) =>
              editingId === phase.id ? (
                <li key={phase.id} className="py-4 sm:px-2">
                  <PhaseForm
                    idPrefix={`phase-${phase.id}`}
                    phase={phase}
                    submitLabel="Save"
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
                <li
                  key={phase.id}
                  className="flex items-baseline justify-between gap-4 py-3 sm:px-2"
                >
                  <div>
                    <span className="text-base font-medium">{phase.name}</span>
                    <span className="ml-3 text-sm text-muted-foreground">
                      {PHASE_STATUS_LABEL[phase.status]}
                      {phase.startsOn || phase.endsOn
                        ? ` · ${phase.startsOn ?? '…'} → ${phase.endsOn ?? '…'}`
                        : ''}
                    </span>
                    {phase.notes ? (
                      <p className="mt-1 max-w-prose text-sm text-muted-foreground whitespace-pre-wrap">
                        {phase.notes}
                      </p>
                    ) : null}
                  </div>
                  {isAdmin ? (
                    <Button
                      type="button"
                      onClick={() => {
                        update.reset();
                        setEditingId(phase.id);
                      }}
                      variant="ghost"
                    >
                      Edit
                    </Button>
                  ) : null}
                </li>
              ),
            )}
          </ul>
        ) : null}
      </div>
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

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
        <Field label="Name" htmlFor={id('name')} error={errors.name?.message}>
          <Input id={id('name')} autoComplete="off" {...register('name')} />
        </Field>
        <Field label="Status" htmlFor={id('status')} error={errors.status?.message}>
          <select id={id('status')} className={inputClass} {...register('status')}>
            {PHASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PHASE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
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
      {serverError ? (
        <p role="alert" className="text-sm">
          {serverError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={formState.isSubmitting}>
          {submitLabel}
        </Button>
        <Button type="button" onClick={onCancel} variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}
