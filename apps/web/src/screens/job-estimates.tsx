import { Pencil } from 'lucide-react';
import { Plus } from 'lucide-react';
import { UnsavedGuard } from '@/components/unsaved-guard';
import { useFocusFirstField, useReturnFocus } from '@/lib/editor-focus';
import { zodResolver } from '@hookform/resolvers/zod';
import type { RouterOutputs } from '@reparo/api';
import {
  estimateFormSchema,
  formatIsoDate,
  isIsoDate,
  type EstimateForm as EstimateFormValues,
  type EstimateFormInput,
} from '@reparo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { AttachedFiles } from '@/components/attached-files';
import { ConfirmRemove } from '@/components/confirm-remove';
import { Field, FormError, Input, MoneyInput, Textarea } from '@/components/form';
import { EstimateStatusBadge } from '@/components/money';
import { EditPanel } from '@/components/edit-panel';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { VendorPicker } from '@/components/vendor-picker';
import { LoadError } from '@/components/load-error';
import { FormPlaceholder } from '@/components/placeholder';
import { centsToInput, money } from '@/lib/money';
import { undoAction, useToasts } from '@/lib/toasts';
import { trpcClient, useTRPC } from '@/lib/trpc';
import type { FileView } from '@/lib/upload';
import { vendorOptions } from '@/lib/vendors';
import type { Job } from '@/lib/work';
import { useRefreshMoney } from '@/lib/refresh';

type Estimate = RouterOutputs['estimates']['list'][number];

const date = (d: string | null) => (d && isIsoDate(d) ? formatIsoDate(d) : null);

/**
 * Estimates on the job page (M4, OD-63; Q1, Q2, Q12–Q14, Q27, Q28): side by side, the cheapest
 * Received one marked. Choosing one puts its amount on the job as the vendor's quote line and
 * makes them the job's vendor; the others are declined. After a payment, choosing asks first,
 * because what's been paid stays on the job.
 */
export function JobEstimates({ job, canEdit }: { job: Job; canEdit: boolean }) {
  const trpc = useTRPC();
  const estimates = useQuery(trpc.estimates.list.queryOptions({ jobId: job.id }));
  const quotes = useQuery({
    ...trpc.files.listMany.queryOptions({
      ownerType: 'estimate',
      ownerIds: (estimates.data ?? []).map((e) => e.id),
    }),
    enabled: (estimates.data?.length ?? 0) > 0,
  });
  const [adding, setAdding] = useState(false);
  // The estimate being edited lives in the address, so the job's quote line can open it
  // (OD-119, Q145).
  const search = useSearch({ from: '/_app/jobs/$jobId' });
  const navigate = useNavigate({ from: '/jobs/$jobId' });
  const editing = search.estimate ?? null;
  const setEditing = (id: string | null) =>
    void navigate({ search: id ? { estimate: id } : {}, replace: id === null });
  useReturnFocus(adding ? `add-estimate-${job.id}` : editing ? `estimate-${editing}` : null);
  const refresh = useRefreshMoney();
  const create = useMutation(trpc.estimates.create.mutationOptions());
  const update = useMutation(trpc.estimates.update.mutationOptions());

  const list = estimates.data ?? [];
  const editingEstimate = list.find((e) => e.id === editing);
  // Loading looks like the one-line empty header, so the panel doesn't jump (OD-145).
  const empty = list.length === 0 && !estimates.error;
  const quotesOf = (id: string): FileView[] => (quotes.data ?? []).filter((f) => f.ownerId === id);

  return (
    <Panel aria-labelledby="job-estimates">
      {/* With none yet, the section is one line: heading, "Not added yet" and Add (OD-120). */}
      <div
        className={
          empty
            ? 'flex flex-wrap items-center gap-x-4 gap-y-2'
            : 'flex flex-wrap items-start justify-between gap-3'
        }
      >
        {empty ? (
          <>
            <h2 id="job-estimates" className="text-2xl">
              Estimates
            </h2>
            {estimates.isPending ? (
              <span className="text-muted-foreground" role="status">
                Loading…
              </span>
            ) : (
              <span className="text-muted-foreground">
                {canEdit ? 'Not added yet' : 'None yet'}
              </span>
            )}
          </>
        ) : (
          <div>
            <h2 id="job-estimates" className="text-2xl">
              Estimates
            </h2>
            {/* Only for those who can choose (OD-145). */}
            {canEdit ? (
              <p className="mt-1 max-w-prose text-muted-foreground">
                Choosing one makes it the job&apos;s price and vendor.
              </p>
            ) : null}
          </div>
        )}
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAdding(true)}
            data-return-focus={`add-estimate-${job.id}`}
          >
            <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
            Add an estimate
          </Button>
        ) : null}
      </div>

      {estimates.error ? (
        <LoadError
          what="the estimates"
          error={estimates.error}
          retry={[estimates]}
          className="mt-3"
        />
      ) : null}

      <EditPanel
        open={adding}
        title="New estimate"
        onClose={() => {
          create.reset();
          setAdding(false);
        }}
      >
        <EstimateForm
          idPrefix={`new-estimate-${job.id}`}
          submitLabel="Add the estimate"
          serverError={create.error?.message}
          onCancel={() => {
            create.reset();
            setAdding(false);
          }}
          onSubmit={async (v) => {
            await create
              .mutateAsync({ ...v, jobId: job.id })
              .then(async () => {
                await refresh();
                setAdding(false);
              })
              .catch(() => undefined);
          }}
        />
      </EditPanel>

      {list.length > 0 ? (
        <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((e) => (
            <EstimateCard
              key={e.id}
              estimate={e}
              quotes={quotesOf(e.id)}
              quotesLoading={quotes.isLoading}
              onRetryQuotes={quotes.isError ? () => void quotes.refetch() : undefined}
              paidCents={job.money.paidCents}
              canEdit={canEdit}
              onEdit={() => setEditing(e.id)}
              onChanged={refresh}
            />
          ))}
        </ul>
      ) : null}

      <EditPanel
        open={editingEstimate !== undefined}
        title={editingEstimate ? `Edit the ${editingEstimate.vendor.name} estimate` : 'Edit'}
        onClose={() => {
          update.reset();
          setEditing(null);
        }}
      >
        {editingEstimate ? (
          <EstimateForm
            idPrefix={`estimate-${editingEstimate.id}`}
            estimate={editingEstimate}
            submitLabel="Save"
            serverError={update.error?.message}
            onCancel={() => {
              update.reset();
              setEditing(null);
            }}
            onSubmit={async (v) => {
              await update
                .mutateAsync({
                  id: editingEstimate.id,
                  vendorId: v.vendorId,
                  amountCents: v.amountCents,
                  receivedOn: v.receivedOn,
                  validUntil: v.validUntil,
                  notes: v.notes,
                  // The chosen one keeps its status; Requested becomes Received with an amount.
                  ...(editingEstimate.status === 'chosen' ? {} : { status: v.status }),
                })
                .then(async () => {
                  await refresh();
                  setEditing(null);
                })
                .catch(() => undefined);
            }}
          />
        ) : null}
      </EditPanel>
    </Panel>
  );
}

function EstimateCard({
  estimate: e,
  quotes,
  quotesLoading,
  onRetryQuotes,
  paidCents,
  canEdit,
  onEdit,
  onChanged,
}: {
  estimate: Estimate;
  quotes: FileView[];
  quotesLoading: boolean;
  onRetryQuotes: (() => void) | undefined;
  paidCents: number;
  canEdit: boolean;
  onEdit: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const trpc = useTRPC();
  const toasts = useToasts();
  // Choosing and declining offer Undo for 10 seconds (OD-119, Q147).
  const choose = useMutation(
    trpc.estimates.choose.mutationOptions({
      onSuccess: async (result) => {
        await onChanged();
        toasts.add({
          title: `Chose ${e.vendor.name}`,
          timeout: 10_000,
          actionProps: undoAction(toasts, () =>
            trpcClient.estimates.undoChoose
              .mutate({
                id: e.id,
                previousChosenId: result.previousChosenId,
                previousVendorId: result.previousVendorId,
              })
              .then(onChanged),
          ),
        });
      },
    }),
  );
  const decline = useMutation(
    trpc.estimates.update.mutationOptions({
      onSuccess: async () => {
        // Only Received and Requested estimates can be declined by hand.
        const was = e.status === 'requested' ? 'requested' : 'received';
        await onChanged();
        toasts.add({
          title: `Marked ${e.vendor.name} declined`,
          timeout: 10_000,
          actionProps: undoAction(toasts, () =>
            trpcClient.estimates.update.mutate({ id: e.id, status: was }).then(onChanged),
          ),
        });
      },
    }),
  );
  const remove = useMutation(trpc.estimates.remove.mutationOptions({ onSuccess: onChanged }));
  const error = choose.error ?? decline.error ?? remove.error;
  const canChoose = e.status !== 'chosen' && e.amountCents !== null;
  const received = date(e.receivedOn);
  const until = date(e.validUntil);

  return (
    <li
      className={
        e.status === 'chosen'
          ? 'flex flex-col gap-3 rounded-xl border-2 border-foreground bg-card p-4'
          : 'flex flex-col gap-3 rounded-xl border border-border bg-card p-4'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-xl break-words">{e.vendor.name}</h3>
        <EstimateStatusBadge status={e.status} />
      </div>
      <div>
        <p className="text-2xl font-semibold tabular-nums">
          {e.amountCents === null ? (
            <span className="text-base font-normal text-muted-foreground">
              Waiting for the amount
            </span>
          ) : (
            money(e.amountCents)
          )}
        </p>
        {e.isCheapest ? (
          <span className="mt-1 inline-flex rounded-lg border border-input px-2 py-0.5 text-sm font-semibold">
            Cheapest
          </span>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        {received ? (
          <>
            <dt className="text-muted-foreground">Received</dt>
            <dd>{received}</dd>
          </>
        ) : null}
        {until ? (
          <>
            <dt className="text-muted-foreground">Good until</dt>
            <dd className={e.isExpired ? 'font-semibold' : undefined}>
              {until}
              {e.isExpired ? ' (expired)' : ''}
            </dd>
          </>
        ) : null}
      </dl>
      {e.notes ? (
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{e.notes}</p>
      ) : null}

      <AttachedFiles
        files={quotes}
        loading={quotesLoading}
        onRetry={onRetryQuotes}
        target={{ ownerType: 'estimate', ownerId: e.id, kind: 'quote' }}
        addLabel="Attach the quote"
        canEdit={canEdit}
        what="quote"
      />

      {canEdit ? (
        <div className="-ml-3 flex flex-wrap items-center gap-1">
          {canChoose && paidCents > 0 ? (
            // Money is already paid on the job: the one confirm step says what stays (Q129).
            <ConfirmRemove
              tone="neutral"
              what={e.vendor.name}
              label="Choose this one"
              question={`${money(paidCents)} already paid on this job stays counted. Choose ${e.vendor.name}${e.amountCents !== null ? ` at ${money(e.amountCents)}` : ''}?`}
              confirmLabel={`Yes, choose ${e.vendor.name}`}
              keepLabel="Keep it as it is"
              className="ml-3"
              disabled={choose.isPending}
              onConfirm={() => choose.mutate({ id: e.id })}
            />
          ) : canChoose ? (
            <Button
              type="button"
              variant="outline"
              className="ml-3"
              disabled={choose.isPending}
              onClick={() => choose.mutate({ id: e.id })}
            >
              Choose this one
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            onClick={onEdit}
            data-return-focus={`estimate-${e.id}`}
          >
            {e.status === 'requested' ? null : (
              <Pencil aria-hidden absoluteStrokeWidth strokeWidth={2} />
            )}
            {e.status === 'requested' ? 'Add the amount' : 'Edit'}
            <span className="sr-only"> for {e.vendor.name}</span>
          </Button>
          {e.status === 'received' || e.status === 'requested' ? (
            <Button
              type="button"
              variant="ghost"
              disabled={decline.isPending}
              onClick={() => decline.mutate({ id: e.id, status: 'declined' })}
            >
              Mark declined
              <span className="sr-only"> for {e.vendor.name}</span>
            </Button>
          ) : null}
          <ConfirmRemove
            what={
              e.status === 'chosen' && e.amountCents !== null
                ? `the ${e.vendor.name} estimate and the ${money(e.amountCents)} it adds to the price`
                : `the ${e.vendor.name} estimate`
            }
            disabled={remove.isPending}
            onConfirm={() => remove.mutate({ id: e.id })}
          />
        </div>
      ) : null}
      {error ? <FormError>{error.message}</FormError> : null}
    </li>
  );
}

function EstimateForm({
  idPrefix,
  estimate,
  submitLabel,
  serverError,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  estimate?: Estimate;
  submitLabel: string;
  serverError: string | undefined;
  onSubmit: (v: EstimateFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const vendors = useQuery(trpc.vendors.list.queryOptions());
  const id = (f: string) => `${idPrefix}-${f}`;
  const { register, control, handleSubmit, formState } = useForm<
    EstimateFormInput,
    unknown,
    EstimateFormValues
  >({
    resolver: zodResolver(estimateFormSchema),
    defaultValues: {
      vendorId: estimate?.vendorId ?? '',
      status: estimate?.status === 'requested' ? 'requested' : 'received',
      amountCents: estimate?.amountCents != null ? centsToInput(estimate.amountCents) : '',
      receivedOn: estimate?.receivedOn ?? '',
      validUntil: estimate?.validUntil ?? '',
      notes: estimate?.notes ?? '',
    },
  });
  const requested = useWatch({ control, name: 'status' }) === 'requested';
  const { errors } = formState;
  const current = estimate?.vendor ?? null;
  const options = vendorOptions(
    (vendors.data ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      trade: v.trade,
      archived: v.archived,
    })),
    current
      ? { id: current.id, name: current.name, trade: current.trade, archived: current.archived }
      : null,
  );

  const formRef = useFocusFirstField<HTMLFormElement>();
  // The vendor picker needs the vendors first (OD-145), like the job form.
  if (vendors.isPending) return <FormPlaceholder label="Loading the form" fields={5} />;
  if (vendors.error) {
    return <LoadError what="the vendors" error={vendors.error} retry={[vendors]} />;
  }
  return (
    <form ref={formRef} onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-4">
      <Field label="Vendor" htmlFor={id('vendor')} error={errors.vendorId?.message}>
        <Controller
          control={control}
          name="vendorId"
          render={({ field }) => (
            <VendorPicker
              id={id('vendor')}
              value={field.value || null}
              onChange={(v) => field.onChange(v ?? '')}
              vendors={options}
            />
          )}
        />
      </Field>
      {estimate?.status === 'chosen' ? null : (
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="size-5 accent-foreground"
                checked={field.value === 'requested'}
                onChange={(ev) => field.onChange(ev.target.checked ? 'requested' : 'received')}
                onBlur={field.onBlur}
              />
              <span>Asked for it, still waiting for the amount</span>
            </label>
          )}
        />
      )}
      <div className="grid gap-4">
        <Field
          label="Amount"
          htmlFor={id('amount')}
          hint={requested ? 'Leave blank until it comes in' : 'The total they quoted'}
          error={errors.amountCents?.message}
        >
          <MoneyInput id={id('amount')} className="max-w-48" {...register('amountCents')} />
        </Field>
        <Field label="Received on" htmlFor={id('received')} error={errors.receivedOn?.message}>
          <Input id={id('received')} type="date" className="max-w-48" {...register('receivedOn')} />
        </Field>
        <Field label="Good until" htmlFor={id('until')} error={errors.validUntil?.message}>
          <Input id={id('until')} type="date" className="max-w-48" {...register('validUntil')} />
        </Field>
      </div>
      <Field
        label="Notes"
        htmlFor={id('notes')}
        hint="What's included, what isn't, payment terms"
        error={errors.notes?.message}
      >
        <Textarea id={id('notes')} rows={3} {...register('notes')} />
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
      <UnsavedGuard
        when={formState.isDirty && !formState.isSubmitting && !formState.isSubmitSuccessful}
      />
    </form>
  );
}
