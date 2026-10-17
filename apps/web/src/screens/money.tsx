import { Pencil, Plus } from 'lucide-react';
import { UnsavedGuard } from '@/components/unsaved-guard';
import { useFocusFirstField, useReturnFocus } from '@/lib/editor-focus';
import { zodResolver } from '@hookform/resolvers/zod';
import type { RouterOutputs } from '@reparo/api';
import {
  adjustmentFormSchema,
  budgetUpdateSchema,
  cents,
  formatIsoDate,
  isIsoDate,
  today,
  type AdjustmentCreate,
  type AdjustmentFormInput,
  type BudgetUpdate,
  type BudgetUpdateInput,
} from '@reparo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ConfirmRemove } from '@/components/confirm-remove';
import { Field, FormError, Input, MoneyInput, Textarea } from '@/components/form';
import { MoneyTape } from '@/components/money-tape';
import { PageHeader } from '@/components/page-header';
import { EditPanel } from '@/components/edit-panel';
import { Panel } from '@/components/panel';
import { PhaseStatusBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { bySize, centsToInput, headline, money, plannedPhaseText } from '@/lib/money';
import { useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Bar, Loading, PanelShape } from '@/components/placeholder';
import { LoadError } from '@/components/load-error';
import { useRefreshMoney } from '@/lib/refresh';
import { useToasts } from '@/lib/toasts';
import type { ShoppingSearch } from '@/lib/shopping';
import { Link } from '@tanstack/react-router';
import { trpcClient } from '@/lib/trpc';

type Summary = RouterOutputs['money']['summary'];
type Budget = RouterOutputs['budget']['get'];
type Adjustment = Budget['adjustments'][number];

const dateText = (d: string | null) => (d && isIsoDate(d) ? formatIsoDate(d) : '');

/** Everything a change to the pool can move: the shared money list (OD-115, Q137). */
const useInvalidatePool = useRefreshMoney;

/**
 * The Money page (M3, OD-53; Q24): the headline and tape, the pool and its adjustments (the
 * admin edits them), and the totals by phase, by kind, by category and by room. Every number
 * comes from `money.summary` and `budget.get`.
 */
export function Money() {
  const trpc = useTRPC();
  const summary = useQuery(trpc.money.summary.queryOptions());
  const budget = useQuery(trpc.budget.get.queryOptions());

  return (
    <section className="flex flex-col gap-8">
      <PageHeader title="Money" />
      {summary.isPending || budget.isPending ? (
        <Loading label="Loading the money">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <Bar className="h-10 w-2/3" />
              <Bar className="mt-3 h-8 w-full" />
            </div>
            <PanelShape lines={4} />
            <PanelShape lines={4} />
          </div>
        </Loading>
      ) : null}
      {summary.error || budget.error ? (
        <LoadError
          what="the money"
          error={summary.error ?? budget.error}
          retry={[summary, budget]}
        />
      ) : null}
      {summary.data && budget.data ? (
        <>
          <Headline s={summary.data} />
          <Pool budget={budget.data} />
          <ByPhase s={summary.data} />
          <div className="grid gap-6 lg:grid-cols-2">
            <Totals
              id="by-category"
              title="Shopping by category"
              rows={summary.data.byCategory}
              empty="Nothing on the shopping list yet."
              filter={(r) => (r.id ? { category: r.id } : {})}
            />
            <Totals
              id="by-room"
              title="Shopping by room"
              note="Jobs aren't split by room; one job can cover many."
              rows={summary.data.byRoom}
              empty="Nothing on the shopping list yet."
              filter={(r) => ({ room: r.id ?? 'house' })}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}

function Headline({ s }: { s: Summary }) {
  const { lead, amount, tail } = headline(s.availableCents);
  return (
    <Panel aria-labelledby="money-left">
      <h2 id="money-left" className="text-3xl tabular-nums">
        {s.pool.poolCents === 0 ? (
          'The budget isn’t in yet.'
        ) : (
          <>
            {lead}
            <span className={s.availableCents < 0 ? 'text-destructive' : undefined}>{amount}</span>
            {tail}
          </>
        )}
      </h2>
      <div className="mt-5">
        <MoneyTape
          poolCents={s.pool.poolCents}
          spentCents={s.spentCents}
          committedCents={s.committedCents}
          availableCents={s.availableCents}
        />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 tabular-nums sm:grid-cols-4">
        <Stat label="Budget" value={money(s.pool.poolCents)} />
        <Stat label="Spent" value={money(s.spentCents)} />
        <Stat label="Planned" value={money(s.committedCents)} />
        <Stat
          label={s.availableCents < 0 ? 'Over by' : 'Left to spend'}
          value={money(Math.abs(s.availableCents))}
          danger={s.availableCents < 0}
        />
      </dl>
    </Panel>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('text-xl font-semibold', danger && 'text-destructive')}>{value}</dd>
    </div>
  );
}

// --- the pool -------------------------------------------------------------------------------

function Pool({ budget }: { budget: Budget }) {
  const trpc = useTRPC();
  const { isAdmin } = useMe();
  const invalidate = useInvalidatePool();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingAdj, setEditingAdj] = useState<string | null>(null);
  useReturnFocus(
    editing ? 'edit-budget' : adding ? 'add-adjustment' : editingAdj ? `adj-${editingAdj}` : null,
  );
  const update = useMutation(trpc.budget.update.mutationOptions());
  const createAdj = useMutation(trpc.budgetAdjustments.create.mutationOptions());
  const updateAdj = useMutation(trpc.budgetAdjustments.update.mutationOptions());
  const removeAdj = useMutation(
    trpc.budgetAdjustments.remove.mutationOptions({ onSuccess: invalidate }),
  );
  const editingAdjustment = budget.adjustments.find((a) => a.id === editingAdj);
  const toasts = useToasts();

  return (
    <Panel aria-labelledby="pool">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="pool" className="text-2xl">
          The budget
        </h2>
        {isAdmin ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditing(true)}
            data-return-focus="edit-budget"
          >
            <Pencil aria-hidden absoluteStrokeWidth strokeWidth={2} />
            Edit the starting balance
          </Button>
        ) : null}
      </div>

      {/* The starting balance and adjustments open in the side panel (OD-90). */}
      <table className="mt-4 w-full tabular-nums">
        <caption className="sr-only">The budget: starting balance, adjustments and total</caption>
        <tbody className="divide-y divide-border">
          <tr>
            <th scope="row" className="py-3 text-left font-normal">
              Starting balance
              {budget.asOf ? (
                <span className="block text-sm text-muted-foreground">
                  As of {dateText(budget.asOf)}
                </span>
              ) : null}
              {/* The notes were saved but never shown (OD-121, Q153). */}
              {budget.notes ? (
                <span className="mt-1 block max-w-prose text-sm whitespace-pre-wrap text-muted-foreground">
                  {budget.notes}
                </span>
              ) : null}
            </th>
            <td className="py-3 text-right font-semibold">{money(budget.startingCents)}</td>
            {isAdmin ? <td /> : null}
          </tr>
          {budget.adjustments.map((a) => (
            <tr key={a.id}>
              <th scope="row" className="py-3 text-left font-normal">
                {a.note || 'Adjustment'}
                <span className="block text-sm text-muted-foreground">{dateText(a.on)}</span>
              </th>
              <td
                className={cn(
                  'py-3 text-right font-semibold',
                  a.amountCents < 0 && 'text-destructive',
                )}
              >
                {a.amountCents > 0 ? '+' : ''}
                {money(a.amountCents)}
              </td>
              {isAdmin ? (
                <td className="w-0 py-3 pl-2 text-right whitespace-nowrap">
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Edit ${a.note || 'adjustment'}`}
                    onClick={() => setEditingAdj(a.id)}
                    data-return-focus={`adj-${a.id}`}
                  >
                    <Pencil aria-hidden absoluteStrokeWidth strokeWidth={2} />
                    Edit
                  </Button>
                  <ConfirmRemove
                    strong
                    what={a.note || 'this adjustment'}
                    disabled={removeAdj.isPending}
                    onConfirm={() => removeAdj.mutate({ id: a.id })}
                  />
                </td>
              ) : null}
            </tr>
          ))}
          <tr>
            <th scope="row" className="py-3 text-left font-semibold">
              Budget
            </th>
            <td className="py-3 text-right text-xl font-semibold">{money(budget.poolCents)}</td>
            {isAdmin ? <td /> : null}
          </tr>
        </tbody>
      </table>
      <EditPanel open={editing} title="The starting balance" onClose={() => setEditing(false)}>
        <BudgetForm
          budget={budget}
          serverError={update.error?.message}
          onCancel={() => setEditing(false)}
          onSubmit={async (v) => {
            await update
              .mutateAsync(v)
              .then(async () => {
                await invalidate();
                setEditing(false);
              })
              .catch(() => undefined);
          }}
        />
      </EditPanel>
      {removeAdj.error ? <FormError>{removeAdj.error.message}</FormError> : null}

      {isAdmin ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => setAdding(true)}
            data-return-focus="add-adjustment"
          >
            <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
            Add money in or out
          </Button>
          <EditPanel
            open={adding}
            title="Money in or out"
            onClose={() => {
              createAdj.reset();
              setAdding(false);
            }}
          >
            <AdjustmentForm
              idPrefix="new-adj"
              submitLabel="Add to the budget"
              namesResult
              serverError={createAdj.error?.message}
              onCancel={() => {
                createAdj.reset();
                setAdding(false);
              }}
              onSubmit={async (v) => {
                await createAdj
                  .mutateAsync(v)
                  .then(async (made) => {
                    await invalidate();
                    setAdding(false);
                    const amount = money(Math.abs(v.amountCents));
                    toasts.add({
                      title:
                        v.amountCents < 0
                          ? `Took ${amount} out of the budget`
                          : `Put ${amount} into the budget`,
                      description: v.note || undefined,
                      timeout: 10_000,
                      ...(made.createdId
                        ? {
                            actionProps: {
                              children: 'Undo',
                              onClick: () =>
                                void trpcClient.budgetAdjustments.remove
                                  .mutate({ id: made.createdId ?? '' })
                                  .then(invalidate)
                                  .catch(() => undefined),
                            },
                          }
                        : {}),
                    });
                  })
                  .catch(() => undefined);
              }}
            />
          </EditPanel>
          <EditPanel
            open={editingAdjustment !== undefined}
            title={editingAdjustment?.note || 'Edit the adjustment'}
            onClose={() => {
              updateAdj.reset();
              setEditingAdj(null);
            }}
          >
            {editingAdjustment ? (
              <AdjustmentForm
                idPrefix={`adj-${editingAdjustment.id}`}
                adjustment={editingAdjustment}
                submitLabel="Save"
                serverError={updateAdj.error?.message}
                onCancel={() => setEditingAdj(null)}
                onSubmit={async (v) => {
                  const before = editingAdjustment;
                  await updateAdj
                    .mutateAsync({ id: before.id, ...v })
                    .then(async () => {
                      await invalidate();
                      setEditingAdj(null);
                      toasts.add({
                        title: `Saved ${v.note || 'the adjustment'}`,
                        timeout: 10_000,
                        actionProps: {
                          children: 'Undo',
                          onClick: () =>
                            void trpcClient.budgetAdjustments.update
                              .mutate({
                                id: before.id,
                                amountCents: before.amountCents,
                                on: before.on,
                                note: before.note,
                              })
                              .then(invalidate)
                              .catch(() => undefined),
                        },
                      });
                    })
                    .catch(() => undefined);
                }}
              />
            ) : null}
          </EditPanel>
        </>
      ) : null}
    </Panel>
  );
}

function BudgetForm({
  budget,
  serverError,
  onSubmit,
  onCancel,
}: {
  budget: Budget;
  serverError: string | undefined;
  onSubmit: (v: BudgetUpdate) => Promise<void>;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState } = useForm<BudgetUpdateInput, unknown, BudgetUpdate>({
    resolver: zodResolver(budgetUpdateSchema),
    defaultValues: {
      startingCents: centsToInput(budget.startingCents),
      asOf: budget.asOf,
      notes: budget.notes,
    },
  });
  const errors = formState.errors;
  const formRef = useFocusFirstField<HTMLFormElement>();
  return (
    <form ref={formRef} onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-4">
      <div className="grid gap-4">
        <Field label="Starting balance" htmlFor="pool-start" error={errors.startingCents?.message}>
          <MoneyInput id="pool-start" className="max-w-48" {...register('startingCents')} />
        </Field>
        <Field label="As of" htmlFor="pool-asof" error={errors.asOf?.message}>
          <Input
            id="pool-asof"
            className="max-w-48"
            type="date"
            {...register('asOf', { setValueAs: (v: unknown) => (v === '' ? null : v) })}
          />
        </Field>
      </div>
      <Field label="Notes" htmlFor="pool-notes" error={errors.notes?.message}>
        <Textarea id="pool-notes" rows={2} {...register('notes')} />
      </Field>
      {serverError ? <FormError>{serverError}</FormError> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={formState.isSubmitting}>
          Save the starting balance
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

/** What the button says the form will do: "Take $5,000.00 out" (OD-121, Q151). */
function resultLabel(direction: 'in' | 'out', typed: unknown): string | null {
  if (typeof typed !== 'string' || typed.trim() === '') return null;
  try {
    const c = cents(typed);
    if (c <= 0) return null;
    return direction === 'out' ? `Take ${money(c)} out` : `Put ${money(c)} in`;
  } catch {
    return null;
  }
}

function AdjustmentForm({
  idPrefix,
  adjustment,
  submitLabel,
  namesResult = false,
  serverError,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  adjustment?: Adjustment;
  submitLabel: string;
  /** The button says what saving does ("Take $5,000.00 out") once there's an amount. */
  namesResult?: boolean;
  serverError: string | undefined;
  onSubmit: (v: AdjustmentCreate) => Promise<void>;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState, watch } = useForm<
    AdjustmentFormInput,
    unknown,
    AdjustmentCreate
  >({
    resolver: zodResolver(adjustmentFormSchema),
    defaultValues: {
      direction: adjustment && adjustment.amountCents < 0 ? 'out' : 'in',
      amountCents: adjustment ? centsToInput(Math.abs(adjustment.amountCents)) : '',
      on: adjustment?.on ?? today(),
      note: adjustment?.note ?? '',
    },
  });
  const errors = formState.errors;
  const id = (f: string) => `${idPrefix}-${f}`;
  const formRef = useFocusFirstField<HTMLFormElement>();
  const direction = watch('direction');
  const label = (namesResult ? resultLabel(direction, watch('amountCents')) : null) ?? submitLabel;
  return (
    <form ref={formRef} onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-4">
      <div className="grid gap-4">
        {/* Which way as a switch, then an amount with no sign (OD-121, Q151). */}
        <fieldset>
          <legend className="text-sm font-semibold">Which way</legend>
          <div className="relative mt-1.5 flex max-w-sm rounded-lg border border-input bg-inset p-0.5">
            <span
              aria-hidden
              className="absolute inset-y-0.5 left-0.5 w-[calc((100%-0.25rem)/2)] rounded-md bg-card shadow-sm transition-transform duration-200 ease-out"
              style={{ transform: `translateX(${direction === 'out' ? 100 : 0}%)` }}
            />
            {(
              [
                ['in', 'Money in'],
                ['out', 'Money out'],
              ] as const
            ).map(([value, text]) => (
              <label
                key={value}
                className={cn(
                  'relative z-10 flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md px-2 text-base transition-colors duration-150 hover:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-solid',
                  direction === value ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                <input type="radio" value={value} className="sr-only" {...register('direction')} />
                {text}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Amount" htmlFor={id('amount')} error={errors.amountCents?.message}>
          <MoneyInput id={id('amount')} className="max-w-48" {...register('amountCents')} />
        </Field>
        <Field label="On" htmlFor={id('on')} error={errors.on?.message}>
          <Input id={id('on')} type="date" className="max-w-48" {...register('on')} />
        </Field>
        <Field
          label="What it is"
          htmlFor={id('note')}
          hint="Like 401K loan."
          error={errors.note?.message}
        >
          <Input id={id('note')} autoComplete="off" {...register('note')} />
        </Field>
      </div>
      {serverError ? <FormError>{serverError}</FormError> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={formState.isSubmitting}>
          {label}
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

// --- totals ---------------------------------------------------------------------------------

function ByPhase({ s }: { s: Summary }) {
  return (
    <Panel aria-labelledby="by-phase">
      <h2 id="by-phase" className="text-2xl">
        By phase
      </h2>
      <table className="mt-3 w-full table-fixed tabular-nums">
        <caption className="sr-only">Spent and planned in each phase</caption>
        {/* Both By phase tables share their columns, so the amounts line up (OD-129, Q183). */}
        <colgroup>
          <col />
          <col className="w-28 sm:w-44" />
          <col className="w-28 sm:w-44" />
        </colgroup>
        <thead>
          <tr className="text-left text-sm text-muted-foreground">
            <th scope="col" className="py-2 font-normal">
              Phase
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-normal">
              Spent
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-normal">
              Planned
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border border-t border-border">
          {s.byPhase.map((p) => {
            const planned =
              p.leavesCents !== null
                ? plannedPhaseText({
                    name: p.name,
                    toComeCents: p.toComeCents,
                    leavesCents: p.leavesCents,
                  })
                : null;
            return (
              <tr key={p.id} className="align-top">
                <th scope="row" className="py-3 pr-3 text-left font-normal">
                  <span className="flex flex-wrap items-center gap-2">
                    {/* Each phase links to it on the Phases page (OD-121, Q152). */}
                    <Link
                      to="/phases"
                      hash={`phase-${p.id}`}
                      className="inline-flex min-h-11 min-w-11 items-center font-semibold underline underline-offset-4 hover:decoration-2"
                    >
                      {p.name}
                    </Link>
                    <PhaseStatusBadge status={p.status} />
                  </span>
                  {planned && planned.amount ? (
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {planned.text}
                      <span
                        className={cn(
                          'font-semibold',
                          planned.short ? 'text-destructive' : 'text-foreground',
                        )}
                      >
                        {planned.amount}
                      </span>
                      .
                    </span>
                  ) : null}
                </th>
                <td className="py-3 pl-3 text-right">{money(p.spentCents)}</td>
                <td className="py-3 pl-3 text-right">{money(p.toComeCents)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-foreground">
          <tr>
            <th scope="row" className="py-3 pr-3 text-left font-semibold">
              Total
            </th>
            <td className="py-3 pl-3 text-right font-semibold">
              {money(s.byPhase.reduce((n, p) => n + p.spentCents, 0))}
            </td>
            <td className="py-3 pl-3 text-right font-semibold">
              {money(s.byPhase.reduce((n, p) => n + p.toComeCents, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
      <table className="mt-5 w-full table-fixed tabular-nums">
        <caption className="mb-1 text-left text-sm text-muted-foreground">
          By kind of spending
        </caption>
        <colgroup>
          <col />
          <col className="w-28 sm:w-44" />
          <col className="w-28 sm:w-44" />
        </colgroup>
        {/* One heading row, like the tables below, not the labels on every row (OD-94). */}
        <thead>
          <tr className="text-left text-sm text-muted-foreground">
            <th scope="col" className="py-2 font-normal">
              <span className="sr-only">Kind</span>
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-normal">
              Spent
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-normal">
              Planned
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border border-t border-border">
          {bySize([
            { name: 'Jobs', to: '/jobs' as const, ...s.jobs },
            { name: 'Shopping', to: '/shopping' as const, ...s.shopping },
          ]).map((t) => (
            <tr key={t.name}>
              <th scope="row" className="py-1 text-left font-semibold">
                <Link
                  to={t.to}
                  className="inline-flex min-h-11 min-w-11 items-center underline underline-offset-4 hover:decoration-2"
                >
                  {t.name}
                </Link>
              </th>
              <td className="py-3 pl-3 text-right">{money(t.spentCents)}</td>
              <td className="py-3 pl-3 text-right">{money(t.committedCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-foreground">
          <tr>
            <th scope="row" className="py-3 text-left font-semibold">
              Total
            </th>
            <td className="py-3 pl-3 text-right font-semibold">{money(s.spentCents)}</td>
            <td className="py-3 pl-3 text-right font-semibold">{money(s.committedCents)}</td>
          </tr>
        </tfoot>
      </table>
    </Panel>
  );
}

type TotalRow = { id: string | null; name: string; spentCents: number; committedCents: number };

/**
 * A breakdown (OD-121, Q152): biggest first, a total row, and each name a link to Shopping
 * filtered to it.
 */
function Totals({
  id,
  title,
  note,
  rows,
  empty,
  filter,
}: {
  id: string;
  title: string;
  note?: string;
  rows: TotalRow[];
  empty: string;
  /** The Shopping filter for a row. */
  filter: (row: TotalRow) => ShoppingSearch;
}) {
  const shown = bySize(rows.filter((r) => r.spentCents !== 0 || r.committedCents !== 0));
  const spent = shown.reduce((n, r) => n + r.spentCents, 0);
  const committed = shown.reduce((n, r) => n + r.committedCents, 0);
  return (
    <Panel aria-labelledby={id}>
      <h2 id={id} className="text-2xl">
        {title}
      </h2>
      {note ? <p className="mt-1 text-sm text-muted-foreground">{note}</p> : null}
      {shown.length === 0 ? (
        <p className="mt-3 text-muted-foreground">{empty}</p>
      ) : (
        <table className="mt-3 w-full tabular-nums">
          <thead>
            <tr className="text-left text-sm text-muted-foreground">
              <th scope="col" className="py-2 font-normal">
                <span className="sr-only">Name</span>
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Spent
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Planned
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border border-t border-border">
            {shown.map((r) => (
              <tr key={r.id ?? 'house'}>
                <th scope="row" className="py-1 pr-3 text-left font-normal break-words">
                  <Link
                    to="/shopping"
                    search={filter(r)}
                    className="inline-flex min-h-11 min-w-11 items-center underline underline-offset-4 hover:decoration-2"
                  >
                    {r.name}
                    <span className="sr-only"> on the shopping list</span>
                  </Link>
                </th>
                <td className="py-3 pl-3 text-right">{money(r.spentCents)}</td>
                <td className="py-3 pl-3 text-right">{money(r.committedCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-foreground">
            <tr>
              <th scope="row" className="py-3 pr-3 text-left font-semibold">
                Total
              </th>
              <td className="py-3 pl-3 text-right font-semibold">{money(spent)}</td>
              <td className="py-3 pl-3 text-right font-semibold">{money(committed)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </Panel>
  );
}
