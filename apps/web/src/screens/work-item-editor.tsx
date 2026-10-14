import { zodResolver } from '@hookform/resolvers/zod';
import {
  WORK_STATUSES,
  workItemFormSchema,
  type WorkItemForm,
  type WorkItemFormInput,
} from '@reparo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Field,
  inputClass,
  primaryButtonClass,
  quietButtonClass,
  Textarea,
} from '@/components/form';
import { useTRPC } from '@/lib/trpc';
import { PHASE_STATUS_LABEL, WORK_STATUS_LABEL, type WorkItem } from '@/lib/work';

type Target =
  /** Edit an existing work item. */
  | { kind: 'edit'; workItem: WorkItem }
  /** Create one for an item, house-wide (`roomId: null`) or for a room, optionally seeded from a default. */
  | { kind: 'create'; itemId: string; roomId: string | null; from?: WorkItem | null };

type Props = {
  target: Target;
  onDone: () => void;
  onCancel: () => void;
  idPrefix: string;
};

function defaults(target: Target, firstPhaseId: string | undefined): WorkItemFormInput {
  const seed = target.kind === 'edit' ? target.workItem : (target.from ?? null);
  return {
    phaseId: seed?.phaseId ?? firstPhaseId ?? '',
    status: target.kind === 'edit' ? target.workItem.status : 'unstarted',
    spec: seed?.spec ?? '',
    notes: target.kind === 'edit' ? target.workItem.notes : '',
  };
}

/**
 * Status, phase, spec, notes for one work item. Item and room are fixed by `target`.
 * Phase defaults to the active phase (first in list order) for new work.
 */
export function WorkItemEditor({ target, onDone, onCancel, idPrefix }: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const phases = useQuery(trpc.phases.list.queryOptions());
  const invalidate = () => queryClient.invalidateQueries(trpc.workItems.pathFilter());
  const create = useMutation(trpc.workItems.create.mutationOptions({ onSuccess: invalidate }));
  const update = useMutation(trpc.workItems.update.mutationOptions({ onSuccess: invalidate }));

  if (phases.isPending) return <p className="text-pencil">Loading phases…</p>;
  if (phases.error) return <p role="alert">Couldn&apos;t load phases: {phases.error.message}</p>;
  if (phases.data.length === 0) {
    return <p role="alert">Add a phase before adding work — every work item belongs to one.</p>;
  }
  return (
    <EditorForm
      target={target}
      phases={phases.data}
      idPrefix={idPrefix}
      serverError={create.error?.message ?? update.error?.message}
      onCancel={onCancel}
      onSubmit={async (values) => {
        try {
          if (target.kind === 'edit') {
            await update.mutateAsync({ id: target.workItem.id, ...values });
          } else {
            await create.mutateAsync({ itemId: target.itemId, roomId: target.roomId, ...values });
          }
          onDone();
        } catch {
          // shown via serverError
        }
      }}
    />
  );
}

function EditorForm({
  target,
  phases,
  idPrefix,
  serverError,
  onCancel,
  onSubmit,
}: {
  target: Target;
  phases: { id: string; name: string; status: 'planned' | 'active' | 'complete' }[];
  idPrefix: string;
  serverError: string | undefined;
  onCancel: () => void;
  onSubmit: (values: WorkItemForm) => Promise<void>;
}) {
  const active = phases.find((p) => p.status === 'active') ?? phases[0];
  const { register, handleSubmit, formState } = useForm<WorkItemFormInput, unknown, WorkItemForm>({
    resolver: zodResolver(workItemFormSchema),
    defaultValues: defaults(target, active?.id),
  });
  const errors = formState.errors;
  const id = (f: string) => `${idPrefix}-${f}`;

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Status" htmlFor={id('status')} error={errors.status?.message}>
          <select id={id('status')} className={inputClass} {...register('status')}>
            {WORK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {WORK_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phase" htmlFor={id('phase')} error={errors.phaseId?.message}>
          <select id={id('phase')} className={inputClass} {...register('phaseId')}>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {PHASE_STATUS_LABEL[p.status]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="Spec"
        htmlFor={id('spec')}
        hint="What exactly is being done or bought: product, colour, finish, size. Markdown is fine."
        error={errors.spec?.message}
      >
        <Textarea id={id('spec')} rows={5} {...register('spec')} />
      </Field>
      <Field label="Notes" htmlFor={id('notes')} error={errors.notes?.message}>
        <Textarea id={id('notes')} rows={3} {...register('notes')} />
      </Field>
      {serverError ? (
        <p role="alert" className="text-sm">
          {serverError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={formState.isSubmitting} className={primaryButtonClass}>
          {target.kind === 'edit' ? 'Save' : 'Add work'}
        </button>
        <button type="button" onClick={onCancel} className={quietButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}
