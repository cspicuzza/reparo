import { Pencil, Plus } from 'lucide-react';
import { UnsavedGuard } from '@/components/unsaved-guard';
import { useFocusFirstField, useReturnFocus } from '@/lib/editor-focus';
import { zodResolver } from '@hookform/resolvers/zod';
import type { RouterOutputs } from '@reparo/api';
import {
  costLineCreateSchema,
  formatIsoDate,
  isIsoDate,
  paymentCreateSchema,
  today,
  type CostLineCreate,
  type CostLineCreateInput,
  type PaymentCreate,
  type PaymentCreateInput,
} from '@reparo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AttachedFiles } from '@/components/attached-files';
import { ConfirmRemove } from '@/components/confirm-remove';
import { EditPanel } from '@/components/edit-panel';
import { Field, FormError, Input, MoneyInput } from '@/components/form';
import { PaymentBadge, ShoppingStatusBadge } from '@/components/money';
import { Panel } from '@/components/panel';
import { TapeStrip } from '@/components/tape';
import { Button, buttonVariants } from '@/components/ui/button';
import { centsToInput, lineAmountText, money, moneyStep } from '@/lib/money';
import { useTRPC } from '@/lib/trpc';
import type { Job } from '@/lib/work';
import { LinesPlaceholder } from '@/components/placeholder';
import { LoadError } from '@/components/load-error';
import { useRefreshMoney } from '@/lib/refresh';

type CostLine = RouterOutputs['costLines']['list'][number];
type Payment = RouterOutputs['payments']['list'][number];

/** Everything a money change on a job can move: the shared money list (OD-115, Q137). */
const useInvalidateMoney = useRefreshMoney;

/**
 * A job's money (M3, OD-51; Q10): what it costs (cost lines), what's been paid toward it
 * (payments, against the job as a whole), where that leaves it, and what was bought for it.
 * Totals and the payment status come from the API.
 */
export function JobMoney({ job, canEdit }: { job: Job; canEdit: boolean }) {
  const trpc = useTRPC();
  const costs = useQuery(trpc.costLines.list.queryOptions({ jobId: job.id }));
  const paid = useQuery(trpc.payments.list.queryOptions({ jobId: job.id }));
  const bought = useQuery(trpc.shoppingLines.list.queryOptions({ jobId: job.id }));
  const { costCents, paidCents, owedCents, payment } = job.money;

  return (
    <Panel aria-labelledby="job-money">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="job-money" className="text-2xl">
          Money
        </h2>
        <PaymentBadge status={payment} />
      </div>

      {/* On a phone, label and amount on one row each; three columns overflowed at 375px
          (OD-119, Q146). */}
      <dl className="mt-4 grid gap-2 tabular-nums sm:grid-cols-3 sm:gap-4">
        {(
          [
            ['Price', costCents],
            ['Paid', paidCents],
            ['Still to pay', owedCents],
          ] as const
        ).map(([label, cents]) => (
          <div
            key={label}
            className="flex flex-wrap items-baseline justify-between gap-x-4 sm:block"
          >
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-xl font-semibold">{money(cents)}</dd>
          </div>
        ))}
      </dl>
      {costCents > 0 ? (
        <TapeStrip
          mode="money"
          usedCents={paidCents}
          totalCents={costCents}
          stepCents={moneyStep(costCents)}
          label={`Paid ${money(paidCents)} of ${money(costCents)}`}
          className="mt-4"
        />
      ) : null}

      <section aria-labelledby="job-costs" className="mt-8 border-t border-border pt-6">
        <h3 id="job-costs" className="text-xl">
          What it costs
        </h3>
        {costs.data ? (
          <CostLines jobId={job.id} lines={costs.data} canEdit={canEdit} />
        ) : costs.error ? (
          <LoadError what="the costs" error={costs.error} retry={[costs]} className="mt-3" />
        ) : (
          <LinesPlaceholder label="Loading costs" className="mt-3" />
        )}
      </section>

      <section aria-labelledby="job-payments" className="mt-8 border-t border-border pt-6">
        <h3 id="job-payments" className="text-xl">
          Payments
        </h3>
        {paid.data ? (
          <Payments jobId={job.id} payments={paid.data} canEdit={canEdit} />
        ) : paid.error ? (
          <LoadError what="the payments" error={paid.error} retry={[paid]} className="mt-3" />
        ) : (
          <LinesPlaceholder label="Loading payments" className="mt-3" />
        )}
      </section>

      {bought.error ? (
        <section aria-labelledby="job-bought" className="mt-8 border-t border-border pt-6">
          <h3 id="job-bought" className="text-xl">
            Bought for this job
          </h3>
          <LoadError
            what="what was bought for this job"
            error={bought.error}
            retry={[bought]}
            className="mt-3"
          />
        </section>
      ) : null}
      {bought.data && bought.data.length > 0 ? (
        <section aria-labelledby="job-bought" className="mt-8 border-t border-border pt-6">
          <h3 id="job-bought" className="text-xl">
            Bought for this job
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Counted on the shopping list, not in the price above.
          </p>
          <ul className="mt-2 divide-y divide-border">
            {bought.data.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block font-semibold break-words">{l.name}</span>
                  <span className="block text-sm text-muted-foreground tabular-nums">
                    {lineAmountText(l)}
                  </span>
                </span>
                <ShoppingStatusBadge status={l.status} />
              </li>
            ))}
          </ul>
          <Link
            to="/shopping"
            search={{ job: job.id }}
            className="mt-2 inline-flex min-h-11 items-center underline underline-offset-4"
          >
            See them on the shopping list
          </Link>
        </section>
      ) : null}
    </Panel>
  );
}

// --- cost lines -------------------------------------------------------------------------------

function CostLines({
  jobId,
  lines,
  canEdit,
}: {
  jobId: string;
  lines: CostLine[];
  canEdit: boolean;
}) {
  const trpc = useTRPC();
  const invalidate = useInvalidateMoney();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  useReturnFocus(adding ? `add-cost-${jobId}` : editing ? `cost-${editing}` : null);
  const create = useMutation(trpc.costLines.create.mutationOptions());
  const update = useMutation(trpc.costLines.update.mutationOptions());
  const remove = useMutation(trpc.costLines.remove.mutationOptions({ onSuccess: invalidate }));
  const editingLine = lines.find((l) => l.id === editing);

  return (
    <div>
      {lines.length === 0 ? (
        <p className="mt-3 text-muted-foreground">No price yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {lines.map((l) => (
            <li
              key={l.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
            >
              <span className="min-w-0 break-words">
                {l.description}
                {l.fromEstimate ? (
                  <span className="block text-sm text-muted-foreground">
                    From the {l.fromEstimate.vendorName} estimate
                  </span>
                ) : null}
              </span>
              <span className="font-semibold tabular-nums">{money(l.amountCents)}</span>
              {canEdit && l.fromEstimate ? (
                // The chosen estimate's line follows the estimate: Edit opens the estimate, and
                // there's no Remove (OD-119, Q145).
                <span className="col-span-2 -ml-3 flex gap-1 sm:col-span-1 sm:ml-0">
                  <Link
                    to="/jobs/$jobId"
                    params={{ jobId }}
                    search={{ estimate: l.fromEstimate.id }}
                    className={buttonVariants({ variant: 'ghost' })}
                  >
                    <Pencil aria-hidden absoluteStrokeWidth strokeWidth={2} />
                    Edit
                    <span className="sr-only"> the {l.fromEstimate.vendorName} estimate</span>
                  </Link>
                </span>
              ) : canEdit ? (
                <span className="col-span-2 -ml-3 flex gap-1 sm:col-span-1 sm:ml-0">
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Edit ${l.description}`}
                    onClick={() => setEditing(l.id)}
                    data-return-focus={`cost-${l.id}`}
                  >
                    <Pencil aria-hidden absoluteStrokeWidth strokeWidth={2} />
                    Edit
                  </Button>
                  <ConfirmRemove
                    what={l.description}
                    disabled={remove.isPending}
                    onConfirm={() => remove.mutate({ id: l.id })}
                  />
                </span>
              ) : null}
              {/* Under the row it's about (OD-145). */}
              {remove.error && remove.variables?.id === l.id ? (
                <FormError className="col-span-full">{remove.error.message}</FormError>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => setAdding(true)}
            data-return-focus={`add-cost-${jobId}`}
          >
            <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
            {lines.length === 0 ? 'Add the price' : 'Add a cost'}
          </Button>
          <EditPanel
            open={adding}
            title={lines.length === 0 ? 'Add the price' : 'Add a cost'}
            onClose={() => {
              create.reset();
              setAdding(false);
            }}
          >
            <CostLineForm
              idPrefix={`new-cost-${jobId}`}
              jobId={jobId}
              submitLabel="Add to the price"
              serverError={create.error?.message}
              onCancel={() => {
                create.reset();
                setAdding(false);
              }}
              onSubmit={async (v) => {
                await create
                  .mutateAsync(v)
                  .then(async () => {
                    await invalidate();
                    setAdding(false);
                  })
                  .catch(() => undefined);
              }}
            />
          </EditPanel>
          <EditPanel
            open={editingLine !== undefined}
            title={editingLine ? `Edit ${editingLine.description}` : 'Edit'}
            onClose={() => {
              update.reset();
              setEditing(null);
            }}
          >
            {editingLine ? (
              <CostLineForm
                idPrefix={`cost-${editingLine.id}`}
                jobId={jobId}
                line={editingLine}
                submitLabel="Save"
                serverError={update.error?.message}
                onCancel={() => {
                  update.reset();
                  setEditing(null);
                }}
                onSubmit={async (v) => {
                  await update
                    .mutateAsync({
                      id: editingLine.id,
                      description: v.description,
                      amountCents: v.amountCents,
                    })
                    .then(async () => {
                      await invalidate();
                      setEditing(null);
                    })
                    .catch(() => undefined);
                }}
              />
            ) : null}
          </EditPanel>
        </>
      ) : null}
    </div>
  );
}

function CostLineForm({
  idPrefix,
  jobId,
  line,
  submitLabel,
  serverError,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  jobId: string;
  line?: CostLine;
  submitLabel: string;
  serverError: string | undefined;
  onSubmit: (values: CostLineCreate) => Promise<void>;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState } = useForm<
    CostLineCreateInput,
    unknown,
    CostLineCreate
  >({
    resolver: zodResolver(costLineCreateSchema),
    defaultValues: {
      jobId,
      description: line?.description ?? '',
      amountCents: line ? centsToInput(line.amountCents) : '',
      notes: line?.notes ?? '',
    },
  });
  const errors = formState.errors;
  const id = (f: string) => `${idPrefix}-${f}`;
  const formRef = useFocusFirstField<HTMLFormElement>();
  return (
    <form ref={formRef} onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-4">
      <div className="grid gap-4">
        <Field
          label="What for"
          htmlFor={id('description')}
          hint="Like Pro-vision quote, Permit or Extra closet trim."
          error={errors.description?.message}
        >
          <Input id={id('description')} autoComplete="off" {...register('description')} />
        </Field>
        <Field label="Amount" htmlFor={id('amount')} error={errors.amountCents?.message}>
          <MoneyInput id={id('amount')} className="max-w-48" {...register('amountCents')} />
        </Field>
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

// --- payments ---------------------------------------------------------------------------------

function Payments({
  jobId,
  payments,
  canEdit,
}: {
  jobId: string;
  payments: Payment[];
  canEdit: boolean;
}) {
  const trpc = useTRPC();
  const invalidate = useInvalidateMoney();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  useReturnFocus(adding ? `add-pay-${jobId}` : editing ? `pay-${editing}` : null);
  const create = useMutation(trpc.payments.create.mutationOptions());
  const update = useMutation(trpc.payments.update.mutationOptions());
  const remove = useMutation(trpc.payments.remove.mutationOptions({ onSuccess: invalidate }));
  const editingPayment = payments.find((p) => p.id === editing);
  const receipts = useQuery(
    trpc.files.listMany.queryOptions({
      ownerType: 'payment',
      ownerIds: payments.map((p) => p.id),
    }),
  );
  const receiptsOf = (paymentId: string) =>
    (receipts.data ?? []).filter((f) => f.ownerId === paymentId);

  return (
    <div>
      {payments.length === 0 ? (
        <p className="mt-3 text-muted-foreground">Nothing paid yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {payments.map((p) => (
            <li
              key={p.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
            >
              <span className="min-w-0">
                <span className="block break-words">{p.note || 'Payment'}</span>
                <span className="block text-sm text-muted-foreground">
                  {isIsoDate(p.paidOn) ? formatIsoDate(p.paidOn) : p.paidOn}
                </span>
                <span className="mt-1 block">
                  <AttachedFiles
                    files={receiptsOf(p.id)}
                    loading={receipts.isLoading}
                    onRetry={receipts.isError ? () => void receipts.refetch() : undefined}
                    target={{ ownerType: 'payment', ownerId: p.id, kind: 'receipt' }}
                    addLabel="Attach a receipt"
                    canEdit={canEdit}
                    what="receipt"
                  />
                </span>
              </span>
              <span className="font-semibold tabular-nums">{money(p.amountCents)}</span>
              {canEdit ? (
                <span className="col-span-2 -ml-3 flex gap-1 sm:col-span-1 sm:ml-0">
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Edit the ${money(p.amountCents)} payment`}
                    onClick={() => setEditing(p.id)}
                    data-return-focus={`pay-${p.id}`}
                  >
                    <Pencil aria-hidden absoluteStrokeWidth strokeWidth={2} />
                    Edit
                  </Button>
                  <ConfirmRemove
                    what={`the ${money(p.amountCents)} payment`}
                    disabled={remove.isPending}
                    onConfirm={() => remove.mutate({ id: p.id })}
                  />
                </span>
              ) : null}
              {/* Under the row it's about (OD-145). */}
              {remove.error && remove.variables?.id === p.id ? (
                <FormError className="col-span-full">{remove.error.message}</FormError>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => setAdding(true)}
            data-return-focus={`add-pay-${jobId}`}
          >
            Record a payment
          </Button>
          <EditPanel
            open={adding}
            title="Record a payment"
            onClose={() => {
              create.reset();
              setAdding(false);
            }}
          >
            <PaymentForm
              idPrefix={`new-pay-${jobId}`}
              jobId={jobId}
              submitLabel="Record payment"
              serverError={create.error?.message}
              onCancel={() => {
                create.reset();
                setAdding(false);
              }}
              onSubmit={async (v) => {
                await create
                  .mutateAsync(v)
                  .then(async () => {
                    await invalidate();
                    setAdding(false);
                  })
                  .catch(() => undefined);
              }}
            />
          </EditPanel>
          <EditPanel
            open={editingPayment !== undefined}
            title="Edit the payment"
            onClose={() => {
              update.reset();
              setEditing(null);
            }}
          >
            {editingPayment ? (
              <PaymentForm
                idPrefix={`pay-${editingPayment.id}`}
                jobId={jobId}
                payment={editingPayment}
                submitLabel="Save"
                serverError={update.error?.message}
                onCancel={() => {
                  update.reset();
                  setEditing(null);
                }}
                onSubmit={async (v) => {
                  await update
                    .mutateAsync({
                      id: editingPayment.id,
                      amountCents: v.amountCents,
                      paidOn: v.paidOn,
                      note: v.note,
                    })
                    .then(async () => {
                      await invalidate();
                      setEditing(null);
                    })
                    .catch(() => undefined);
                }}
              />
            ) : null}
          </EditPanel>
        </>
      ) : null}
    </div>
  );
}

function PaymentForm({
  idPrefix,
  jobId,
  payment,
  submitLabel,
  serverError,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  jobId: string;
  payment?: Payment;
  submitLabel: string;
  serverError: string | undefined;
  onSubmit: (values: PaymentCreate) => Promise<void>;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState } = useForm<PaymentCreateInput, unknown, PaymentCreate>(
    {
      resolver: zodResolver(paymentCreateSchema),
      defaultValues: {
        jobId,
        amountCents: payment ? centsToInput(payment.amountCents) : '',
        paidOn: payment?.paidOn ?? today(),
        note: payment?.note ?? '',
      },
    },
  );
  const errors = formState.errors;
  const id = (f: string) => `${idPrefix}-${f}`;
  const formRef = useFocusFirstField<HTMLFormElement>();
  return (
    <form ref={formRef} onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-4">
      <div className="grid gap-4">
        <Field label="Amount" htmlFor={id('amount')} error={errors.amountCents?.message}>
          <MoneyInput id={id('amount')} className="max-w-48" {...register('amountCents')} />
        </Field>
        <Field label="Paid on" htmlFor={id('date')} error={errors.paidOn?.message}>
          <Input id={id('date')} type="date" className="max-w-48" {...register('paidOn')} />
        </Field>
        <Field
          label="Note"
          htmlFor={id('note')}
          hint="Like Deposit or Final."
          error={errors.note?.message}
        >
          <Input id={id('note')} autoComplete="off" {...register('note')} />
        </Field>
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
