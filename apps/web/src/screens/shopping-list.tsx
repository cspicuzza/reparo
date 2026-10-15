import { Check } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { amountFormSchema, type AmountForm, type AmountFormInput } from '@reparo/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AttachedFiles } from '@/components/attached-files';
import { Field, FormError, Input } from '@/components/form';
import { UnsavedGuard } from '@/components/unsaved-guard';
import { Button, buttonVariants } from '@/components/ui/button';
import { useFocusFirstField, useReturnFocus } from '@/lib/editor-focus';
import { centsToInput, lineAmountText, money } from '@/lib/money';
import { lineDetails, type ShoppingLine } from '@/lib/shopping';
import { useToasts } from '@/lib/toasts';
import { useTRPC } from '@/lib/trpc';
import type { FileView } from '@/lib/upload';
import { useInvalidateShopping } from '@/lib/use-invalidate-shopping';
import { cn } from '@/lib/utils';

/**
 * Shopping lines as rows (M3, OD-52; reshaped in Workflow polish, OD-78). A row shows only
 * what you need while shopping: the picture, the name, the price, store and quantity, and the
 * one next step. To buy: "Open product page" and "Mark as purchased" (asks what was paid, then
 * offers Undo). Purchased: what was paid and "Attach receipt". Everything else lives in the
 * line's panel, opened from its name.
 */
export function ShoppingRows({
  lines,
  files,
  canEdit,
  onOpen,
  className,
}: {
  lines: ShoppingLine[];
  /** The lines' pictures and receipts, fetched once by the page. */
  files: FileView[];
  canEdit: boolean;
  /** Open a line's panel. */
  onOpen: (line: ShoppingLine) => void;
  className?: string;
}) {
  return (
    <ul className={cn('divide-y divide-border', className)}>
      {lines.map((l) => (
        <li key={l.id} className="py-4">
          <ShoppingRow
            line={l}
            canEdit={canEdit}
            files={files.filter((f) => f.ownerId === l.id)}
            onOpen={() => onOpen(l)}
          />
        </li>
      ))}
    </ul>
  );
}

function ShoppingRow({
  line,
  canEdit,
  files,
  onOpen,
}: {
  line: ShoppingLine;
  canEdit: boolean;
  files: FileView[];
  onOpen: () => void;
}) {
  const [buying, setBuying] = useState(false);
  // Fading out before the list refreshes, so the row visibly leaves To buy (OD-81).
  const [leaving, setLeaving] = useState(false);
  useReturnFocus(buying ? `line-purchase-${line.id}` : null);
  const thumb = files.find((f) => f.kind === 'product_image' && f.url);
  const receipts = files.filter((f) => f.kind === 'receipt');
  const details = lineDetails(line);

  const actions = buying ? null : line.status === 'to_buy' ? (
    line.link || canEdit ? (
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        {line.link ? (
          <a
            href={line.link}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'outline' })}
          >
            Open product page
            <span className="sr-only"> for {line.name} (opens in a new tab)</span>
          </a>
        ) : null}
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setBuying(true)}
            data-return-focus={`line-purchase-${line.id}`}
          >
            <Check aria-hidden absoluteStrokeWidth strokeWidth={2} />
            Mark as purchased
            <span className="sr-only"> {line.name}</span>
          </Button>
        ) : null}
      </div>
    ) : null
  ) : line.status === 'purchased' && (receipts.length > 0 || canEdit) ? (
    <AttachedFiles
      files={receipts}
      target={{ ownerType: 'shopping_line', ownerId: line.id, kind: 'receipt' }}
      addLabel="Attach receipt"
      canEdit={canEdit}
      what="receipt"
    />
  ) : null;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 transition-[opacity,translate] duration-150 ease-out',
        leaving && '-translate-y-3 opacity-0',
      )}
    >
      {/* Phone: picture, name and price, with the buttons underneath. Laptop: one line, so a
          long list stays short (OD-78). */}
      <div
        className={cn(
          'grid items-start gap-x-3 gap-y-3 sm:items-center sm:gap-x-4',
          thumb?.url
            ? 'grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]'
            : 'grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto]',
        )}
      >
        {thumb?.url ? (
          <img
            src={thumb.url}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-14 shrink-0 rounded-lg border border-border bg-inset object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <button
            type="button"
            onClick={onOpen}
            className="-mx-1 rounded-md px-1 text-left text-lg font-semibold break-words underline-offset-4 hover:underline"
          >
            {line.name}
            <span className="sr-only">, open details</span>
          </button>
          {details ? <p className="text-sm text-muted-foreground">{details}</p> : null}
        </div>
        <span className="text-right text-lg font-semibold whitespace-nowrap tabular-nums">
          {lineAmountText(line)}
        </span>
        {actions ? <div className="col-span-full sm:col-span-1">{actions}</div> : null}
      </div>
      {buying ? (
        <PurchaseForm
          line={line}
          onDone={() => setBuying(false)}
          onLeaving={async (refresh) => {
            setLeaving(true);
            await new Promise((done) => setTimeout(done, 150));
            await refresh();
            // Where the list shows every status, the row stays: bring it back.
            setLeaving(false);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * "What was paid", prefilled with the price, then the line moves to Purchased and a message
 * offers Undo (Q28). Money keeps a labelled button (web.md → Saving).
 */
function PurchaseForm({
  line,
  onDone,
  onLeaving,
}: {
  line: ShoppingLine;
  onDone: () => void;
  /** Fade the row out, then refresh the list without it. */
  onLeaving: (refresh: () => Promise<unknown>) => Promise<void>;
}) {
  const trpc = useTRPC();
  const invalidate = useInvalidateShopping();
  const toasts = useToasts();
  const update = useMutation(trpc.shoppingLines.update.mutationOptions());
  const undo = useMutation(trpc.shoppingLines.update.mutationOptions({ onSuccess: invalidate }));
  return (
    <AmountForm
      idPrefix={`buy-${line.id}`}
      label="What was paid"
      hint={`The price was ${money(line.priceCents)}. Tax and delivery count too.`}
      initial={line.priceCents}
      submitLabel="Mark as purchased"
      serverError={update.error?.message}
      onCancel={onDone}
      onSubmit={async (paidCents) => {
        await update
          .mutateAsync({ id: line.id, status: 'purchased', paidCents })
          .then(async () => {
            onDone();
            await onLeaving(invalidate);
            toasts.add({
              title: 'Marked as purchased',
              description: `${line.name}, ${money(paidCents)} paid`,
              // Twice Base UI's 5s default, so there's time to reach Undo (it also pauses
              // while hovered or focused).
              timeout: 10_000,
              actionProps: {
                children: 'Undo',
                onClick: () => undo.mutate({ id: line.id, status: 'to_buy' }),
              },
            });
          })
          .catch(() => undefined);
      }}
    />
  );
}

/** One amount, prefilled: what was paid, or how much came back. */
export function AmountForm({
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
  const formRef = useFocusFirstField<HTMLFormElement>();
  return (
    <form
      ref={formRef}
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
      <UnsavedGuard
        when={formState.isDirty && !formState.isSubmitting && !formState.isSubmitSuccessful}
      />
    </form>
  );
}
