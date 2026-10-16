import { UnsavedGuard } from '@/components/unsaved-guard';
import { useFocusFirstField } from '@/lib/editor-focus';
import { zodResolver } from '@hookform/resolvers/zod';
import { jobCreateSchema, type JobCreate, type JobCreateInput } from '@reparo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useController, useForm, useWatch } from 'react-hook-form';
import { Field, FormError, Input, Select, Textarea } from '@/components/form';
import { VendorPicker } from '@/components/vendor-picker';
import { vendorOptions, type VendorOption } from '@/lib/vendors';
import { useTRPC } from '@/lib/trpc';
import { PHASE_STATUS_LABEL } from '@/lib/work';
import { Button } from '@/components/ui/button';
import { FormPlaceholder } from '@/components/placeholder';
import { LoadError } from '@/components/load-error';
import { useRefreshJobs } from '@/lib/refresh';

type Props = {
  idPrefix: string;
  /** After saving: the new job's id. */
  onSaved: (jobId: string) => void;
  onCancel: () => void;
};

/**
 * A new job: name, phase, vendor, house-wide spec, notes, and the rooms it covers (checkboxes,
 * with All rooms / None), added with one button. A job that exists is edited in place in its
 * panel (job-panel.tsx, OD-89). A job's status comes from its rooms, so it isn't set here.
 */
export function JobEditor({ idPrefix, onSaved, onCancel }: Props) {
  const trpc = useTRPC();
  const phases = useQuery(trpc.phases.list.queryOptions());
  const rooms = useQuery(trpc.rooms.list.queryOptions());
  const vendors = useQuery(trpc.vendors.list.queryOptions());

  const invalidate = useRefreshJobs();
  const create = useMutation(trpc.jobs.create.mutationOptions());
  const error = create.error;

  if (phases.isPending || rooms.isPending || vendors.isPending) {
    return <FormPlaceholder label="Loading the form" fields={5} />;
  }
  if (phases.error || rooms.error || vendors.error) {
    return (
      <LoadError
        what="the form"
        error={phases.error ?? rooms.error ?? vendors.error}
        retry={[phases, rooms, vendors]}
      />
    );
  }
  if (phases.data.length === 0) {
    return <p role="alert">Add a phase first. Every job belongs to one.</p>;
  }

  const active = phases.data.find((p) => p.status === 'active') ?? phases.data[0];

  async function save(values: JobCreate) {
    try {
      const savedId = (await create.mutateAsync(values)).id;
      await invalidate();
      onSaved(savedId);
    } catch {
      await invalidate(); // shown via `error`
    }
  }

  return (
    <JobForm
      idPrefix={idPrefix}
      phases={phases.data}
      rooms={rooms.data}
      vendors={vendorOptions(vendors.data, null)}
      defaults={{
        name: '',
        phaseId: active?.id ?? '',
        vendorId: null,
        spec: '',
        notes: '',
        roomIds: [],
      }}
      submitLabel="Add job"
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
