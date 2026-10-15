import { zodResolver } from '@hookform/resolvers/zod';
import {
  shoppingLineCreateSchema,
  type ShoppingLineCreate,
  type ShoppingLineCreateInput,
} from '@reparo/shared';
import { useQuery } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { Field, FormError, Input, Select, Textarea } from '@/components/form';
import { Button } from '@/components/ui/button';
import { centsToInput } from '@/lib/money';
import type { ShoppingLine } from '@/lib/shopping';
import { useTRPC } from '@/lib/trpc';
import { PHASE_STATUS_LABEL } from '@/lib/work';

/** Empty <select> values mean "none" (whole house, no job). */
const orNull = (v: unknown) => (v === '' ? null : v);

/**
 * Add or edit a shopping line (M3, OD-52): what it is, where it goes, what it should cost and
 * which phase it belongs to. Buying and returning are separate actions on the line, not here.
 */
export function ShoppingLineForm({
  idPrefix,
  line,
  defaults,
  submitLabel,
  serverError,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  line?: ShoppingLine;
  /** Presets for a new line, e.g. the room it's added from. */
  defaults?: Partial<ShoppingLineCreateInput>;
  submitLabel: string;
  serverError: string | undefined;
  onSubmit: (values: ShoppingLineCreate) => Promise<void>;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const phases = useQuery(trpc.phases.list.queryOptions());
  const rooms = useQuery(trpc.rooms.list.queryOptions());
  const categories = useQuery(trpc.categories.list.queryOptions());
  const jobs = useQuery(trpc.jobs.list.queryOptions());

  if (phases.isPending || rooms.isPending || categories.isPending || jobs.isPending) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (phases.error || rooms.error || categories.error || jobs.error) {
    const message = (phases.error ?? rooms.error ?? categories.error ?? jobs.error)?.message;
    return <p role="alert">Couldn&apos;t load: {message}</p>;
  }
  if (phases.data.length === 0)
    return <p role="alert">Add a phase first. Every line belongs to one.</p>;

  const active = phases.data.find((p) => p.status === 'active') ?? phases.data[0];
  const other = categories.data.find((c) => c.name === 'Other') ?? categories.data[0];

  return (
    <LineFields
      idPrefix={idPrefix}
      phases={phases.data}
      rooms={rooms.data}
      categories={categories.data}
      jobs={jobs.data}
      defaultValues={{
        name: line?.name ?? '',
        phaseId: line?.phaseId ?? defaults?.phaseId ?? active?.id ?? '',
        categoryId: line?.categoryId ?? defaults?.categoryId ?? other?.id ?? '',
        roomId: line ? line.roomId : (defaults?.roomId ?? null),
        jobId: line ? line.jobId : (defaults?.jobId ?? null),
        priceCents: line ? centsToInput(line.priceCents) : '',
        store: line?.store ?? '',
        link: line?.link ?? '',
        quantity: line?.quantity ?? 1,
        modelNumber: line?.modelNumber ?? '',
        notes: line?.notes ?? '',
      }}
      submitLabel={submitLabel}
      serverError={serverError}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}

function LineFields({
  idPrefix,
  phases,
  rooms,
  categories,
  jobs,
  defaultValues,
  submitLabel,
  serverError,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  phases: { id: string; name: string; status: 'planned' | 'active' | 'complete' }[];
  rooms: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  jobs: { id: string; name: string; phaseId: string }[];
  defaultValues: ShoppingLineCreateInput;
  submitLabel: string;
  serverError: string | undefined;
  onSubmit: (values: ShoppingLineCreate) => Promise<void>;
  onCancel: () => void;
}) {
  const { register, handleSubmit, control, formState } = useForm<
    ShoppingLineCreateInput,
    unknown,
    ShoppingLineCreate
  >({ resolver: zodResolver(shoppingLineCreateSchema), defaultValues });
  const errors = formState.errors;
  const id = (f: string) => `${idPrefix}-${f}`;
  // A line's job must be in its phase, so only that phase's jobs are offered.
  const phaseId = useWatch({ control, name: 'phaseId' });
  const phaseJobs = jobs.filter((j) => j.phaseId === phaseId);

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
        <Field label="What it is" htmlFor={id('name')} error={errors.name?.message}>
          <Input id={id('name')} autoComplete="off" {...register('name')} />
        </Field>
        <Field
          label="Price"
          htmlFor={id('price')}
          hint="The whole line, all of them."
          error={errors.priceCents?.message}
        >
          <Input
            id={id('price')}
            inputMode="decimal"
            autoComplete="off"
            {...register('priceCents')}
          />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Room" htmlFor={id('room')} error={errors.roomId?.message}>
          <Select id={id('room')} {...register('roomId', { setValueAs: orNull })}>
            <option value="">Whole house</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor={id('category')} error={errors.categoryId?.message}>
          <Select id={id('category')} {...register('categoryId')}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Phase"
          htmlFor={id('phase')}
          hint="Planned phases don't count against the money yet."
          error={errors.phaseId?.message}
        >
          <Select id={id('phase')} {...register('phaseId')}>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({PHASE_STATUS_LABEL[p.status].toLowerCase()})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Store" htmlFor={id('store')} error={errors.store?.message}>
          <Input id={id('store')} autoComplete="off" {...register('store')} />
        </Field>
        <Field label="Link" htmlFor={id('link')} error={errors.link?.message}>
          <Input id={id('link')} type="url" autoComplete="off" {...register('link')} />
        </Field>
        <Field
          label="For a job"
          htmlFor={id('job')}
          hint="Like tile for the flooring job."
          error={errors.jobId?.message}
        >
          <Select id={id('job')} {...register('jobId', { setValueAs: orNull })}>
            <option value="">No job</option>
            {phaseJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="How many" htmlFor={id('qty')} error={errors.quantity?.message}>
          <Input
            id={id('qty')}
            type="number"
            min={1}
            step={1}
            {...register('quantity', { valueAsNumber: true })}
          />
        </Field>
        <Field label="Model number" htmlFor={id('model')} error={errors.modelNumber?.message}>
          <Input id={id('model')} autoComplete="off" {...register('modelNumber')} />
        </Field>
      </div>
      <Field label="Notes" htmlFor={id('notes')} error={errors.notes?.message}>
        <Textarea id={id('notes')} rows={2} {...register('notes')} />
      </Field>
      {serverError ? <FormError>{serverError}</FormError> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={formState.isSubmitting}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
