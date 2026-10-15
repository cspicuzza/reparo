import { Pencil, Plus } from 'lucide-react';
import { UnsavedGuard } from '@/components/unsaved-guard';
import { useFocusFirstField, useReturnFocus } from '@/lib/editor-focus';
import { zodResolver } from '@hookform/resolvers/zod';
import type { RouterOutputs } from '@reparo/api';
import {
  adjustmentCreateSchema,
  budgetUpdateSchema,
  formatIsoDate,
  isIsoDate,
  today,
  type AdjustmentCreate,
  type AdjustmentCreateInput,
  type BudgetUpdate,
  type BudgetUpdateInput,
} from '@reparo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ConfirmRemove } from '@/components/confirm-remove';
import { Field, FormError, Input, Textarea } from '@/components/form';
import { MoneyTape } from '@/components/money-tape';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { PhaseStatusBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { centsToInput, headline, money, plannedPhaseText } from '@/lib/money';
import { useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';

type Summary = RouterOutputs['money']['summary'];
type Budget = RouterOutputs['budget']['get'];
type Adjustment = Budget['adjustments'][number];

const dateText = (d: string | null) => (d && isIsoDate(d) ? formatIsoDate(d) : '');

/** Everything a change to the pool can move. */
function useInvalidatePool() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.budget.pathFilter()),
      queryClient.invalidateQueries(trpc.money.pathFilter()),
      queryClient.invalidateQueries(trpc.home.pathFilter()),
    ]);
}

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
      <PageHeader
        title="Money"
        description="The budget, what's spent, what's committed and what's left."
      />
      {summary.isPending || budget.isPending ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : null}
      {summary.error || budget.error ? (
        <p role="alert">Couldn&apos;t load the money: {(summary.error ?? budget.error)?.message}</p>
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
            />
            <Totals
              id="by-room"
              title="Shopping by room"
              note="Jobs aren't split by room; one job can cover many."
              rows={summary.data.byRoom}
              empty="Nothing on the shopping list yet."
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
        <Stat label="Committed" value={money(s.committedCents)} />
        <Stat
          label={s.availableCents < 0 ? 'Over by' : 'Left to spend'}
          value={money(Math.abs(s.availableCents))}
          danger={s.availableCents < 0}
        />
      </dl>
      <p className="mt-3 text-sm text-muted-foreground">
        Committed is what jobs still cost (their price less what&apos;s been paid) and the price of
        everything still to buy, in phases that have started. Planned phases come in when they
        start.
      </p>
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

  return (
    <Panel aria-labelledby="pool">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="pool" className="text-2xl">
          The budget
        </h2>
        {isAdmin && !editing ? (
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

      {editing ? (
        <div className="mt-4">
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
        </div>
      ) : (
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
              </th>
              <td className="py-3 text-right font-semibold">{money(budget.startingCents)}</td>
              {isAdmin ? <td /> : null}
            </tr>
            {budget.adjustments.map((a) =>
              editingAdj === a.id ? (
                <tr key={a.id}>
                  <td colSpan={isAdmin ? 3 : 2} className="py-3">
                    <AdjustmentForm
                      idPrefix={`adj-${a.id}`}
                      adjustment={a}
                      submitLabel="Save"
                      serverError={updateAdj.error?.message}
                      onCancel={() => setEditingAdj(null)}
                      onSubmit={async (v) => {
                        await updateAdj
                          .mutateAsync({ id: a.id, ...v })
                          .then(async () => {
                            await invalidate();
                            setEditingAdj(null);
                          })
                          .catch(() => undefined);
                      }}
                    />
                  </td>
                </tr>
              ) : (
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
                        what={a.note || 'this adjustment'}
                        disabled={removeAdj.isPending}
                        onConfirm={() => removeAdj.mutate({ id: a.id })}
                      />
                    </td>
                  ) : null}
                </tr>
              ),
            )}
            <tr>
              <th scope="row" className="py-3 text-left font-semibold">
                Budget
              </th>
              <td className="py-3 text-right text-xl font-semibold">{money(budget.poolCents)}</td>
              {isAdmin ? <td /> : null}
            </tr>
          </tbody>
        </table>
      )}
      {removeAdj.error ? <FormError>{removeAdj.error.message}</FormError> : null}

      {isAdmin && !editing ? (
        adding ? (
          <div className="mt-4 rounded-xl border border-border bg-background p-4">
            <AdjustmentForm
              idPrefix="new-adj"
              submitLabel="Add to the budget"
              serverError={createAdj.error?.message}
              onCancel={() => {
                createAdj.reset();
                setAdding(false);
              }}
              onSubmit={async (v) => {
                await createAdj
                  .mutateAsync(v)
                  .then(async () => {
                    await invalidate();
                    setAdding(false);
                  })
                  .catch(() => undefined);
              }}
            />
          </div>
        ) : (
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
        )
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starting balance" htmlFor="pool-start" error={errors.startingCents?.message}>
          <Input
            id="pool-start"
            inputMode="decimal"
            autoComplete="off"
            {...register('startingCents')}
          />
        </Field>
        <Field label="As of" htmlFor="pool-asof" error={errors.asOf?.message}>
          <Input
            id="pool-asof"
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
          Save the budget
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

function AdjustmentForm({
  idPrefix,
  adjustment,
  submitLabel,
  serverError,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  adjustment?: Adjustment;
  submitLabel: string;
  serverError: string | undefined;
  onSubmit: (v: AdjustmentCreate) => Promise<void>;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState } = useForm<
    AdjustmentCreateInput,
    unknown,
    AdjustmentCreate
  >({
    resolver: zodResolver(adjustmentCreateSchema),
    defaultValues: {
      amountCents: adjustment ? centsToInput(adjustment.amountCents) : '',
      on: adjustment?.on ?? today(),
      note: adjustment?.note ?? '',
    },
  });
  const errors = formState.errors;
  const id = (f: string) => `${idPrefix}-${f}`;
  const formRef = useFocusFirstField<HTMLFormElement>();
  return (
    <form ref={formRef} onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Amount"
          htmlFor={id('amount')}
          hint="A minus sign takes money out, like -5,000."
          error={errors.amountCents?.message}
        >
          <Input
            id={id('amount')}
            inputMode="decimal"
            autoComplete="off"
            {...register('amountCents')}
          />
        </Field>
        <Field label="On" htmlFor={id('on')} error={errors.on?.message}>
          <Input id={id('on')} type="date" {...register('on')} />
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

// --- totals ---------------------------------------------------------------------------------

function ByPhase({ s }: { s: Summary }) {
  return (
    <Panel aria-labelledby="by-phase">
      <h2 id="by-phase" className="text-2xl">
        By phase
      </h2>
      <table className="mt-3 w-full tabular-nums">
        <caption className="sr-only">Spent and still to come in each phase</caption>
        <thead>
          <tr className="text-left text-sm text-muted-foreground">
            <th scope="col" className="py-2 font-normal">
              Phase
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-normal">
              Spent
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-normal">
              Still to come
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
                    <span className="font-semibold">{p.name}</span>
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
      </table>
      <table className="mt-5 w-full tabular-nums">
        <caption className="mb-1 text-left text-sm text-muted-foreground">
          By kind of spending
        </caption>
        <tbody className="divide-y divide-border border-t border-border">
          {(
            [
              ['Jobs', s.jobs],
              ['Shopping', s.shopping],
            ] as const
          ).map(([name, t]) => (
            <tr key={name}>
              <th scope="row" className="py-3 text-left font-semibold">
                {name}
              </th>
              <td className="py-3 pl-3 text-right">
                <span className="block text-sm text-muted-foreground">Spent</span>
                {money(t.spentCents)}
              </td>
              <td className="py-3 pl-3 text-right">
                <span className="block text-sm text-muted-foreground">Committed</span>
                {money(t.committedCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Totals({
  id,
  title,
  note,
  rows,
  empty,
}: {
  id: string;
  title: string;
  note?: string;
  rows: { id: string | null; name: string; spentCents: number; committedCents: number }[];
  empty: string;
}) {
  const shown = rows.filter((r) => r.spentCents !== 0 || r.committedCents !== 0);
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
                Committed
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border border-t border-border">
            {shown.map((r) => (
              <tr key={r.id ?? 'house'}>
                <th scope="row" className="py-3 pr-3 text-left font-normal break-words">
                  {r.name}
                </th>
                <td className="py-3 pl-3 text-right">{money(r.spentCents)}</td>
                <td className="py-3 pl-3 text-right">{money(r.committedCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
