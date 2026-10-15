import { zodResolver } from '@hookform/resolvers/zod';
import { amountFormSchema, type AmountForm, type AmountFormInput } from '@reparo/shared';
import { useMutation } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ConfirmRemove } from '@/components/confirm-remove';
import { Field, FormError, Input } from '@/components/form';
import { ShoppingStatusBadge } from '@/components/money';
import { Button } from '@/components/ui/button';
import { centsToInput, lineAmountText, money } from '@/lib/money';
import { lineWhere, type ShoppingLine } from '@/lib/shopping';
import { useInvalidateShopping } from '@/lib/use-invalidate-shopping';
import { useTRPC } from '@/lib/trpc';
import { ShoppingLineForm } from './shopping-line-form';

/**
 * Shopping lines as rows (M3, OD-52): what it is, where it goes, what it costs and where it
 * stands, with "Mark as purchased" (asks what was paid) and "Mark as returned" (asks how much
 * came back). Used on the Shopping page and a room's "What we're buying".
 */
export function ShoppingList({
  lines,
  canEdit,
  showRoom = true,
}: {
  lines: ShoppingLine[];
  canEdit: boolean;
  showRoom?: boolean;
}) {
  return (
    <ul className="divide-y divide-border">
      {lines.map((l) => (
        <li key={l.id} className="py-4 first:pt-0 last:pb-0">
          <LineRow line={l} canEdit={canEdit} showRoom={showRoom} />
        </li>
      ))}
    </ul>
  );
}

type Mode = 'view' | 'edit' | 'purchase' | 'return';

function LineRow({
  line,
  canEdit,
  showRoom,
}: {
  line: ShoppingLine;
  canEdit: boolean;
  showRoom: boolean;
}) {
  const trpc = useTRPC();
  const invalidate = useInvalidateShopping();
  const [mode, setMode] = useState<Mode>('view');
  const update = useMutation(trpc.shoppingLines.update.mutationOptions());
  const remove = useMutation(trpc.shoppingLines.remove.mutationOptions({ onSuccess: invalidate }));
  const done = async () => {
    await invalidate();
    setMode('view');
  };

  const details = [
    showRoom ? lineWhere(line) : null,
    line.category.name,
    line.store || null,
    line.quantity > 1 ? `${line.quantity} of them` : null,
    line.phase.status === 'planned' ? `${line.phase.name} (planned)` : null,
    line.job ? `For ${line.job.name}` : null,
  ].filter((d): d is string => d !== null);

  if (mode === 'edit') {
    return (
      <div className="rounded-xl border border-border bg-background p-4">
        <h3 className="text-xl">Edit {line.name}</h3>
        <div className="mt-4">
          <ShoppingLineForm
            idPrefix={`line-${line.id}`}
            line={line}
            submitLabel="Save"
            serverError={update.error?.message}
            onCancel={() => {
              update.reset();
              setMode('view');
            }}
            onSubmit={async (v) => {
              await update
                .mutateAsync({ id: line.id, ...v })
                .then(done)
                .catch(() => undefined);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-semibold break-words">{line.name}</p>
          <p className="text-sm text-muted-foreground">{details.join(', ')}</p>
        </div>
        <div className="flex max-w-44 flex-col items-end gap-1 text-right sm:max-w-none">
          <span className="font-semibold tabular-nums">{lineAmountText(line)}</span>
          <ShoppingStatusBadge status={line.status} />
        </div>
      </div>
      {line.notes ? (
        <p className="max-w-prose text-sm text-muted-foreground whitespace-pre-wrap">
          {line.notes}
        </p>
      ) : null}

      {mode === 'purchase' ? (
        <AmountForm
          idPrefix={`buy-${line.id}`}
          label="What was paid"
          hint={`The price was ${money(line.priceCents)}. Tax and delivery count too.`}
          initial={line.priceCents}
          submitLabel="Mark as purchased"
          serverError={update.error?.message}
          onCancel={() => setMode('view')}
          onSubmit={async (paidCents) => {
            await update
              .mutateAsync({ id: line.id, status: 'purchased', paidCents })
              .then(done)
              .catch(() => undefined);
          }}
        />
      ) : mode === 'return' ? (
        <AmountForm
          idPrefix={`return-${line.id}`}
          label="How much came back"
          hint={`${money(line.paidCents ?? 0)} was paid. Anything kept back, like a restocking fee, stays spent.`}
          initial={line.paidCents ?? 0}
          submitLabel="Mark as returned"
          serverError={update.error?.message}
          onCancel={() => setMode('view')}
          onSubmit={async (refundCents) => {
            await update
              .mutateAsync({ id: line.id, status: 'returned', refundCents })
              .then(done)
              .catch(() => undefined);
          }}
        />
      ) : (
        <div className="-ml-3 flex flex-wrap items-center gap-1">
          {line.link ? (
            <a
              href={line.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 underline underline-offset-4"
            >
              Product page
              <ExternalLink aria-hidden className="size-4" />
            </a>
          ) : null}
          {canEdit ? (
            <>
              {line.status === 'to_buy' ? (
                <Button
                  type="button"
                  variant="outline"
                  className="ml-3"
                  onClick={() => setMode('purchase')}
                >
                  Mark as purchased
                </Button>
              ) : null}
              {line.status === 'purchased' ? (
                <Button type="button" variant="ghost" onClick={() => setMode('return')}>
                  Mark as returned
                </Button>
              ) : null}
              {line.status !== 'to_buy' ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={update.isPending}
                  onClick={() =>
                    void update
                      .mutateAsync({ id: line.id, status: 'to_buy' })
                      .then(done)
                      .catch(() => undefined)
                  }
                >
                  Back to To buy
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                aria-label={`Edit ${line.name}`}
                onClick={() => setMode('edit')}
              >
                Edit
              </Button>
              <ConfirmRemove
                what={line.name}
                disabled={remove.isPending}
                onConfirm={() => remove.mutate({ id: line.id })}
              />
            </>
          ) : null}
        </div>
      )}
      {mode === 'view' && (update.error ?? remove.error) ? (
        <FormError>{(update.error ?? remove.error)?.message}</FormError>
      ) : null}
    </div>
  );
}

/** One amount, prefilled: what was paid, or how much came back. */
function AmountForm({
  idPrefix,
  label,
  hint,
  initial,
  submitLabel,
  serverError,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  label: string;
  hint: string;
  initial: number;
  submitLabel: string;
  serverError: string | undefined;
  onSubmit: (cents: number) => Promise<void>;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState } = useForm<AmountFormInput, unknown, AmountForm>({
    resolver: zodResolver(amountFormSchema),
    defaultValues: { amount: centsToInput(initial) },
  });
  return (
    <form
      onSubmit={(e) => void handleSubmit((v) => onSubmit(v.amount))(e)}
      className="grid gap-3 rounded-xl border border-border bg-background p-4"
    >
      <Field
        label={label}
        htmlFor={`${idPrefix}-amount`}
        hint={hint}
        error={formState.errors.amount?.message}
      >
        <Input
          id={`${idPrefix}-amount`}
          inputMode="decimal"
          autoComplete="off"
          className="sm:max-w-48"
          {...register('amount')}
        />
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
