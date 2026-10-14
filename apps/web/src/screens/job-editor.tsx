import { zodResolver } from '@hookform/resolvers/zod';
import { jobCreateSchema, type JobCreate, type JobCreateInput } from '@reparo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import {
  Field,
  Input,
  inputClass,
  primaryButtonClass,
  quietButtonClass,
  Textarea,
} from '@/components/form';
import { useTRPC } from '@/lib/trpc';
import { PHASE_STATUS_LABEL, type Job } from '@/lib/work';

type Props = {
  idPrefix: string;
  item: { id: string; name: string };
  /** The job to edit; omitted → a new job for `item`. */
  job?: Job;
  onDone: () => void;
};

/**
 * Name, phase, house-wide spec, notes, and the rooms the job covers (checkboxes, with All
 * rooms / None). Unchecking a room takes it off the job; checking it again brings it back as
 * Unstarted. A job's status comes from its rooms, so it isn't edited here.
 */
export function JobEditor({ idPrefix, item, job, onDone }: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const phases = useQuery(trpc.phases.list.queryOptions());
  const rooms = useQuery(trpc.rooms.list.queryOptions());

  const invalidate = () => queryClient.invalidateQueries(trpc.jobs.pathFilter());
  const create = useMutation(trpc.jobs.create.mutationOptions());
  const update = useMutation(trpc.jobs.update.mutationOptions());
  const addRoom = useMutation(trpc.jobRooms.create.mutationOptions());
  const removeRoom = useMutation(trpc.jobRooms.remove.mutationOptions());
  const error = create.error ?? update.error ?? addRoom.error ?? removeRoom.error;

  if (phases.isPending || rooms.isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (phases.error || rooms.error) {
    return <p role="alert">Couldn&apos;t load: {(phases.error ?? rooms.error)?.message}</p>;
  }
  if (phases.data.length === 0) {
    return <p role="alert">Add a phase first — every job belongs to one.</p>;
  }

  const active = phases.data.find((p) => p.status === 'active') ?? phases.data[0];

  async function save(values: JobCreate) {
    try {
      if (!job) {
        await create.mutateAsync({ ...values, itemId: item.id });
      } else {
        const phaseName = phases.data?.find((p) => p.id === values.phaseId)?.name ?? '';
        await update.mutateAsync({
          id: job.id,
          name: values.name === '' ? `${item.name} — ${phaseName}` : values.name,
          phaseId: values.phaseId,
          spec: values.spec,
          notes: values.notes,
        });
        const before = new Map(job.rooms.map((r) => [r.roomId, r.id]));
        const after = new Set(values.roomIds);
        for (const roomId of after) {
          if (!before.has(roomId)) await addRoom.mutateAsync({ jobId: job.id, roomId });
        }
        for (const [roomId, jobRoomId] of before) {
          if (!after.has(roomId)) await removeRoom.mutateAsync({ id: jobRoomId });
        }
      }
      await invalidate();
      onDone();
    } catch {
      await invalidate(); // shown via `error`; refresh in case part of an edit went through
    }
  }

  return (
    <JobForm
      idPrefix={idPrefix}
      phases={phases.data}
      rooms={rooms.data}
      defaults={{
        itemId: item.id,
        name: job?.name ?? '',
        phaseId: job?.phaseId ?? active?.id ?? '',
        spec: job?.spec ?? '',
        notes: job?.notes ?? '',
        roomIds: job?.rooms.map((r) => r.roomId) ?? [],
      }}
      namePlaceholder={`${item.name} — ${active?.name ?? 'Phase'}`}
      submitLabel={job ? 'Save job' : 'Add job'}
      serverError={error?.message}
      onSubmit={save}
      onCancel={onDone}
    />
  );
}

function JobForm({
  idPrefix,
  phases,
  rooms,
  defaults,
  namePlaceholder,
  submitLabel,
  serverError,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  phases: { id: string; name: string; status: 'planned' | 'active' | 'complete' }[];
  rooms: { id: string; name: string }[];
  defaults: JobCreateInput;
  namePlaceholder: string;
  submitLabel: string;
  serverError: string | undefined;
  onSubmit: (values: JobCreate) => Promise<void>;
  onCancel: () => void;
}) {
  const { register, handleSubmit, setValue, control, formState } = useForm<
    JobCreateInput,
    unknown,
    JobCreate
  >({
    resolver: zodResolver(jobCreateSchema),
    defaultValues: defaults,
  });
  const errors = formState.errors;
  const id = (f: string) => `${idPrefix}-${f}`;
  // Checkboxes are driven by hand rather than `register`: react-hook-form returns a boolean
  // instead of an array when a checkbox group has a single box (one room in the house).
  const picked = new Set(useWatch({ control, name: 'roomIds' }) ?? []);
  const toggle = (roomId: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(roomId);
    else next.delete(roomId);
    setValue(
      'roomIds',
      rooms.filter((r) => next.has(r.id)).map((r) => r.id),
      { shouldDirty: true },
    );
  };

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Name"
          htmlFor={id('name')}
          hint="Leave blank to name it after the item and phase."
          error={errors.name?.message}
        >
          <Input
            id={id('name')}
            autoComplete="off"
            placeholder={namePlaceholder}
            {...register('name')}
          />
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
        hint="What's being done or bought, the same in every room unless a room says otherwise: product, colour, finish, size."
        error={errors.spec?.message}
      >
        <Textarea id={id('spec')} rows={4} {...register('spec')} />
      </Field>
      <Field label="Notes" htmlFor={id('notes')} error={errors.notes?.message}>
        <Textarea id={id('notes')} rows={2} {...register('notes')} />
      </Field>

      <fieldset>
        <legend className="text-sm font-medium">Rooms this job covers</legend>
        {rooms.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No rooms yet. A job with no rooms (a fee, say) has its own status.
          </p>
        ) : (
          <>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setValue(
                    'roomIds',
                    rooms.map((r) => r.id),
                    { shouldDirty: true },
                  )
                }
                className={quietButtonClass + ' border border-input'}
              >
                All rooms
              </button>
              <button
                type="button"
                onClick={() => setValue('roomIds', [], { shouldDirty: true })}
                className={quietButtonClass + ' border border-input'}
              >
                None
              </button>
            </div>
            <ul className="mt-3 grid gap-x-6 sm:grid-cols-2">
              {rooms.map((r) => (
                <li key={r.id}>
                  <label className="flex min-h-11 items-center gap-3 text-base">
                    <input
                      type="checkbox"
                      checked={picked.has(r.id)}
                      onChange={(e) => toggle(r.id, e.target.checked)}
                      className="size-5 accent-primary"
                    />
                    {r.name}
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-sm text-muted-foreground">
              Taking a room off removes its status and spec for this job.
            </p>
          </>
        )}
        {errors.roomIds?.message ? (
          <p role="alert" className="mt-1 text-sm">
            {errors.roomIds.message}
          </p>
        ) : null}
      </fieldset>

      {serverError ? (
        <p role="alert" className="text-sm">
          {serverError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={formState.isSubmitting} className={primaryButtonClass}>
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={quietButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}
