import { UnsavedGuard } from '@/components/unsaved-guard';
import { useFocusFirstField } from '@/lib/editor-focus';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  shoppingLineCreateSchema,
  type ShoppingLineCreate,
  type ShoppingLineCreateInput,
} from '@reparo/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Field, FormError, Input, MoneyInput, Select, Textarea } from '@/components/form';
import { Reveal } from '@/components/reveal';
import { Button } from '@/components/ui/button';
import { centsToInput } from '@/lib/money';
import type { ShoppingLine } from '@/lib/shopping';
import { useTRPC } from '@/lib/trpc';
import { PHASE_STATUS_LABEL } from '@/lib/work';
import { FormPlaceholder } from '@/components/placeholder';
import { LoadError } from '@/components/load-error';

/** Empty <select> values mean "none" (whole house, no job). */
const orNull = (v: unknown) => (v === '' ? null : v);

/**
 * Add or edit a shopping line (M3, OD-52; shortened in Workflow polish, OD-80): what it is, its
 * price, room, category, store, link and notes up front; how many, phase, job and model number
 * under "More details". Store suggests the stores already in use. Buying and returning are
 * separate actions on the line, not here. One field per line (OD-82). Used for adding; an
 * existing line is edited in place in its panel.
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
  // Suggestions only; the form doesn't wait for them.
  const stores = useQuery(trpc.shoppingLines.stores.queryOptions());

  if (phases.isPending || rooms.isPending || categories.isPending || jobs.isPending) {
    return <FormPlaceholder label="Loading the form" fields={5} />;
  }
  if (phases.error || rooms.error || categories.error || jobs.error) {
    return (
      <LoadError
        what="the form"
        error={phases.error ?? rooms.error ?? categories.error ?? jobs.error}
        retry={[phases, rooms, categories, jobs]}
      />
    );
  }
  if (phases.data.length === 0)
    return <p role="alert">Add a phase first. Everything on the list belongs to one.</p>;

  const active = phases.data.find((p) => p.status === 'active') ?? phases.data[0];
  const other = categories.data.find((c) => c.name === 'Other') ?? categories.data[0];

  return (
    <LineFields
      idPrefix={idPrefix}
      phases={phases.data}
      rooms={rooms.data}
      categories={categories.data}
      jobs={jobs.data}
      stores={(stores.data ?? []).map((st) => st.name)}
      startWithMore={
        line !== undefined && (line.quantity > 1 || line.jobId !== null || line.modelNumber !== '')
      }
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
  stores,
  startWithMore,
  defaultValues,
  submitLabel,
  serverError,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  /** Store names already in use, for suggestions. */
  stores: string[];
  /** Open "More details" at the start (editing a line that already uses them). */
  startWithMore: boolean;
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

  const formRef = useFocusFirstField<HTMLFormElement>();
  // The details people rarely set start folded (OD-80), unless the line already uses them or
  // one of them has a problem to fix.
  const moreErrors = Boolean(
    errors.quantity ?? errors.phaseId ?? errors.jobId ?? errors.modelNumber,
  );
  const [more, setMore] = useState(startWithMore);
  return (
    <form ref={formRef} onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-5">
      <div className="grid gap-5">
        <Field label="What it is" htmlFor={id('name')} error={errors.name?.message}>
          <Input id={id('name')} autoComplete="off" {...register('name')} />
        </Field>
        <Field
          label="Price"
          htmlFor={id('price')}
          hint="All of them together."
          error={errors.priceCents?.message}
        >
          <MoneyInput id={id('price')} className="max-w-48" {...register('priceCents')} />
        </Field>
      </div>
      <div className="grid gap-5">
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
          label="Store"
          htmlFor={id('store')}
          hint="Pick one you've used or type a new one."
          error={errors.store?.message}
        >
          <Input id={id('store')} autoComplete="off" list={id('stores')} {...register('store')} />
        </Field>
        <Field label="Link" htmlFor={id('link')} error={errors.link?.message}>
          <Input id={id('link')} type="url" autoComplete="off" {...register('link')} />
        </Field>
      </div>
      {/* The browser's own suggestions as you type (Workflow polish, OD-69/OD-80). */}
      <datalist id={id('stores')}>
        {stores.map((st) => (
          <option key={st} value={st} />
        ))}
      </datalist>
      <Field label="Notes" htmlFor={id('notes')} error={errors.notes?.message}>
        <Textarea id={id('notes')} rows={4} {...register('notes')} />
      </Field>

      <div>
        <Button
          type="button"
          variant="ghost"
          className="-ml-3"
          aria-expanded={more || moreErrors}
          aria-controls={id('more')}
          onClick={() => setMore((v) => !v)}
        >
          {more || moreErrors ? 'Fewer details' : 'More details'}
          <span className="font-normal text-muted-foreground">
            (how many, phase, job, model number)
          </span>
        </Button>
        <Reveal open={more || moreErrors} id={id('more')} className="mt-3 grid gap-5">
          <Field label="How many" htmlFor={id('qty')} error={errors.quantity?.message}>
            <Input
              id={id('qty')}
              className="max-w-48"
              type="number"
              min={1}
              step={1}
              {...register('quantity', { valueAsNumber: true })}
            />
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
          <Field label="Model number" htmlFor={id('model')} error={errors.modelNumber?.message}>
            <Input id={id('model')} autoComplete="off" {...register('modelNumber')} />
          </Field>
        </Reveal>
      </div>

      {serverError ? <FormError>{serverError}</FormError> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={formState.isSubmitting}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <UnsavedGuard
        when={formState.isDirty && !formState.isSubmitting && !formState.isSubmitSuccessful}
      />
    </form>
  );
}
