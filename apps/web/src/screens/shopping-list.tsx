import { Check, ExternalLink, PanelRightOpen } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { amountFormSchema, type AmountForm, type AmountFormInput } from '@reparo/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AttachedFiles } from '@/components/attached-files';
import { Field, FormError, Input } from '@/components/form';
import { UnsavedGuard } from '@/components/unsaved-guard';
import { Button } from '@/components/ui/button';
import { useFocusFirstField, useReturnFocus } from '@/lib/editor-focus';
import { centsToInput, lineAmountText, money } from '@/lib/money';
import { lineDetails, type ShoppingLine } from '@/lib/shopping';
import { useToasts } from '@/lib/toasts';
import { useTRPC } from '@/lib/trpc';
import type { FileView } from '@/lib/upload';
import { useInvalidateShopping } from '@/lib/use-invalidate-shopping';
import { cn } from '@/lib/utils';

/**
 * Shopping lines as rows (M3, OD-52; reshaped in Workflow polish, OD-78 and OD-82). A row shows
 * what you need while shopping: the picture, the name, the store as a link to the product
 * page, how many, the price, and the next step. To buy: Details and "Mark as purchased" (asks
 * what was paid, then offers Undo). Purchased: Details and "Attach receipt". Everything else
 * lives in the line's panel, opened from Details.
 *
 * On a laptop the rows share one grid (CSS subgrid), so pictures, names, prices and buttons
 * each line up in a column and the prices can be scanned down the list (Q41).
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
  // A picture column only when some line in this list has a picture, so a list without any
  // doesn't start every name one gap in.
  const pictured = new Set(
    files.filter((f) => f.kind === 'product_image' && f.url).map((f) => f.ownerId),
  );
  const withPictures = lines.some((l) => pictured.has(l.id));
  return (
    <ul
      className={cn(
        'divide-y divide-border sm:grid sm:gap-x-4',
        withPictures
          ? 'sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]'
          : 'sm:grid-cols-[minmax(0,1fr)_auto_auto]',
        className,
      )}
    >
      {lines.map((l) => (
        <li key={l.id} className="py-4 sm:col-span-full sm:grid sm:grid-cols-subgrid">
          <ShoppingRow
            line={l}
            canEdit={canEdit}
            files={files.filter((f) => f.ownerId === l.id)}
            pictureColumn={withPictures}
            onOpen={() => onOpen(l)}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Row buttons on a laptop look 36px tall with 14px text, so the price outweighs them; an
 * invisible margin keeps the tap area 44px (OD-82, Q54). Phones keep full-size buttons.
 */
const ROW_BUTTON =
  "relative sm:min-h-9 sm:px-3 sm:text-sm sm:[&_svg:not([class*='size-'])]:size-4 sm:after:absolute sm:after:inset-x-0 sm:after:-inset-y-1";

function ShoppingRow({
  line,
  canEdit,
  files,
  pictureColumn,
  onOpen,
}: {
  line: ShoppingLine;
  canEdit: boolean;
  files: FileView[];
  /** The list has a picture column on a laptop, so this row fills its cell even without one. */
  pictureColumn: boolean;
  onOpen: () => void;
}) {
  const [buying, setBuying] = useState(false);
  // Fading out before the list refreshes, so the row visibly leaves To buy (OD-81).
  const [leaving, setLeaving] = useState(false);
  useReturnFocus(buying ? `line-purchase-${line.id}` : null);
  const thumb = files.find((f) => f.kind === 'product_image' && f.url);
  const receipts = files.filter((f) => f.kind === 'receipt');

  const details = (
    <Button
      type="button"
      variant="ghost"
      // On a phone it starts the row of buttons, so its icon lines up with the name.
      className={cn(ROW_BUTTON, '-ml-3 sm:ml-0')}
      onClick={onOpen}
      data-return-focus={line.id}
    >
      <PanelRightOpen aria-hidden absoluteStrokeWidth strokeWidth={2} />
      Details
      <span className="sr-only"> for {line.name}</span>
    </Button>
  );
  const actions = buying ? null : (
    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end">
      {details}
      {line.status === 'to_buy' && canEdit ? (
        <Button
          type="button"
          variant="outline"
          className={ROW_BUTTON}
          onClick={() => setBuying(true)}
          data-return-focus={`line-purchase-${line.id}`}
        >
          <Check aria-hidden absoluteStrokeWidth strokeWidth={2} />
          Mark as purchased
          <span className="sr-only"> {line.name}</span>
        </Button>
      ) : null}
      {line.status === 'purchased' && (receipts.length > 0 || canEdit) ? (
        <AttachedFiles
          files={receipts}
          target={{ ownerType: 'shopping_line', ownerId: line.id, kind: 'receipt' }}
          addLabel="Attach receipt"
          canEdit={canEdit}
          what="receipt"
        />
      ) : null}
    </div>
  );

  return (
    <div
      className={cn(
        'flex flex-col gap-3 transition-[opacity,translate] duration-150 ease-out sm:col-span-full sm:grid sm:grid-cols-subgrid',
        leaving && '-translate-y-3 opacity-0',
      )}
    >
      {/* Phone: picture, name and price, with the buttons underneath. Laptop: one line per
          item, in the list's shared columns. */}
      <div
        className={cn(
          'grid items-start gap-x-3 gap-y-3 sm:col-span-full sm:grid-cols-subgrid sm:items-center sm:gap-x-4',
          thumb?.url ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]',
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
        ) : pictureColumn ? (
          // Keeps the picture column on a laptop, so names still line up.
          <span aria-hidden className="hidden sm:block" />
        ) : null}
        <div className="min-w-0">
          <p className="text-lg font-semibold break-words">{line.name}</p>
          <LineFacts line={line} />
        </div>
        <span className="text-right text-xl font-semibold whitespace-nowrap tabular-nums">
          {lineAmountText(line)}
        </span>
        {actions ? <div className="col-span-full sm:col-span-1">{actions}</div> : null}
      </div>
      {buying ? (
        <div className="sm:col-span-full">
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
        </div>
      ) : null}
    </div>
  );
}

/**
 * The grey line under a name: the store as a link to the product page (or "Product page" when
 * there's a link but no store; plain text when there's no link), how many, and a planned phase
 * (OD-82, Q43).
 */
function LineFacts({ line }: { line: ShoppingLine }) {
  const facts = lineDetails(line);
  const store = line.link ? (
    <a
      href={line.link}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-foreground underline underline-offset-4"
    >
      {line.store || 'Product page'}
      <ExternalLink aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only"> for {line.name} (opens in a new tab)</span>
    </a>
  ) : line.store ? (
    line.store
  ) : null;
  if (!store && !facts) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {store}
      {store && facts ? ', ' : null}
      {facts}
    </p>
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
