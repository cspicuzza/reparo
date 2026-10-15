import { UnsavedGuard } from '@/components/unsaved-guard';
import { useFocusFirstField } from '@/lib/editor-focus';
import { zodResolver } from '@hookform/resolvers/zod';
import { jobCreateSchema, type JobCreate, type JobCreateInput } from '@reparo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useController, useForm, useWatch } from 'react-hook-form';
import { Field, FormError, Input, Select, Textarea } from '@/components/form';
import { VendorPicker } from '@/components/vendor-picker';
import { vendorOptions, type VendorOption } from '@/lib/vendors';
import { useTRPC } from '@/lib/trpc';
import { PHASE_STATUS_LABEL, type Job } from '@/lib/work';
import { Button } from '@/components/ui/button';
import { FormPlaceholder } from '@/components/placeholder';

type Props = {
  idPrefix: string;
  /** The job to edit; omitted → a new job. */
  job?: Job;
  /** After saving: the job's id (new or edited). */
  onSaved: (jobId: string) => void;
  onCancel: () => void;
};

/**
 * Name, phase, vendor, house-wide spec, notes, and the rooms the job covers (checkboxes, with
 * All rooms / None). Unchecking a room takes it off the job; checking it again brings it back as
 * Unstarted. A job's status comes from its rooms, so it isn't edited here.
 */
export function JobEditor({ idPrefix, job, onSaved, onCancel }: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const phases = useQuery(trpc.phases.list.queryOptions());
  const rooms = useQuery(trpc.rooms.list.queryOptions());
  const vendors = useQuery(trpc.vendors.list.queryOptions());

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.jobs.pathFilter()),
      queryClient.invalidateQueries(trpc.vendors.pathFilter()),
      queryClient.invalidateQueries(trpc.home.pathFilter()),
    ]);
  const create = useMutation(trpc.jobs.create.mutationOptions());
  const update = useMutation(trpc.jobs.update.mutationOptions());
  const addRoom = useMutation(trpc.jobRooms.create.mutationOptions());
  const removeRoom = useMutation(trpc.jobRooms.remove.mutationOptions());
  const error = create.error ?? update.error ?? addRoom.error ?? removeRoom.error;

  if (phases.isPending || rooms.isPending || vendors.isPending) {
    return <FormPlaceholder label="Loading the form" fields={5} />;
  }
  if (phases.error || rooms.error || vendors.error) {
    const message = (phases.error ?? rooms.error ?? vendors.error)?.message;
    return <p role="alert">Couldn&apos;t load: {message}</p>;
  }
  if (phases.data.length === 0) {
    return <p role="alert">Add a phase first. Every job belongs to one.</p>;
  }

  const active = phases.data.find((p) => p.status === 'active') ?? phases.data[0];

  async function save(values: JobCreate) {
    try {
      let savedId: string;
      if (!job) {
        savedId = (await create.mutateAsync(values)).id;
      } else {
        savedId = job.id;
        await update.mutateAsync({
          id: job.id,
          name: values.name,
          phaseId: values.phaseId,
          // Leave an archived vendor in place unless someone picks another.
          ...(values.vendorId !== job.vendorId ? { vendorId: values.vendorId } : {}),
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
      onSaved(savedId);
    } catch {
      await invalidate(); // shown via `error`; refresh in case part of an edit went through
    }
  }

  return (
    <JobForm
      idPrefix={idPrefix}
      phases={phases.data}
      rooms={rooms.data}
      vendors={vendorOptions(vendors.data, job?.vendor ?? null)}
      defaults={{
        name: job?.name ?? '',
        phaseId: job?.phaseId ?? active?.id ?? '',
        vendorId: job?.vendorId ?? null,
        spec: job?.spec ?? '',
        notes: job?.notes ?? '',
        roomIds: job?.rooms.map((r) => r.roomId) ?? [],
      }}
      submitLabel={job ? 'Save job' : 'Add job'}
      serverError={error?.message}
      onSubmit={save}
      onCancel={onCancel}
    />
  );
}

function JobForm({
  idPrefix,
  phases,
  rooms,
  vendors,
  defaults,
  submitLabel,
  serverError,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  phases: { id: string; name: string; status: 'planned' | 'active' | 'complete' }[];
  rooms: { id: string; name: string }[];
  vendors: VendorOption[];
  defaults: JobCreateInput;
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
  const vendorField = useController({ control, name: 'vendorId' });
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

  const formRef = useFocusFirstField<HTMLFormElement>();
  return (
    <form ref={formRef} onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-5">
      <div className="grid gap-5">
        <Field
          label="Name"
          htmlFor={id('name')}
          hint="What the work is, like Interior paint or Demo week."
          error={errors.name?.message}
        >
          <Input id={id('name')} autoComplete="off" {...register('name')} />
        </Field>
        <Field label="Phase" htmlFor={id('phase')} error={errors.phaseId?.message}>
          <Select id={id('phase')} {...register('phaseId')}>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({PHASE_STATUS_LABEL[p.status].toLowerCase()})
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Vendor"
        htmlFor={id('vendor')}
        hint="Who's doing it. Search by name or what they do, or type a new name to add them. Leave empty for work you do yourselves."
        error={errors.vendorId?.message}
      >
        <VendorPicker
          id={id('vendor')}
          value={vendorField.field.value ?? null}
          onChange={vendorField.field.onChange}
          vendors={vendors}
        />
      </Field>

      <Field
        label="Spec"
        htmlFor={id('spec')}
        hint="What's being done, the same in every room unless a room says otherwise: product, colour, finish, size."
        error={errors.spec?.message}
      >
        <Textarea id={id('spec')} rows={4} {...register('spec')} />
      </Field>
      <Field label="Notes" htmlFor={id('notes')} error={errors.notes?.message}>
        <Textarea id={id('notes')} rows={2} {...register('notes')} />
      </Field>

      <fieldset>
        <legend className="text-sm font-semibold">Rooms this job covers</legend>
        {rooms.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No rooms yet. A job with no rooms (a fee, say) has its own status.
          </p>
        ) : (
          <>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                onClick={() =>
                  setValue(
                    'roomIds',
                    rooms.map((r) => r.id),
                    { shouldDirty: true },
                  )
                }
                variant="outline"
              >
                All rooms
              </Button>
              <Button
                type="button"
                onClick={() => setValue('roomIds', [], { shouldDirty: true })}
                variant="outline"
              >
                None
              </Button>
            </div>
            <ul className="mt-3 grid">
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
        {errors.roomIds?.message ? <FormError>{errors.roomIds.message}</FormError> : null}
      </fieldset>

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
