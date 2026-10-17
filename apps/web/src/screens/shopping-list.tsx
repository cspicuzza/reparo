import { Check, ExternalLink, PanelRightOpen } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { amountFormSchema, type AmountForm, type AmountFormInput } from '@reparo/shared';
import { useMutation } from '@tanstack/react-query';
import { Fragment, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { AttachedFiles } from '@/components/attached-files';
import { Field, FormError, MoneyInput } from '@/components/form';
import { UnsavedGuard } from '@/components/unsaved-guard';
import { Button } from '@/components/ui/button';
import { useFocusFirstField, useReturnFocus } from '@/lib/editor-focus';
import { useIsPhone } from '@/lib/media';
import { centsToInput, lineAmountText, lineHasAmount, money } from '@/lib/money';
import { lineDetails, lineWhere, type ShoppingLine } from '@/lib/shopping';
import { undoAction, useToasts } from '@/lib/toasts';
import { useTRPC } from '@/lib/trpc';
import type { FileView } from '@/lib/upload';
import { useRefreshShopping } from '@/lib/refresh';
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
  selection,
  byStore = false,
  className,
}: {
  lines: ShoppingLine[];
  /** Grouped by store: rows name the room instead of repeating the store (OD-144). */
  byStore?: boolean;
  /** The lines' pictures and receipts, fetched once by the page. */
  files: FileView[];
  canEdit: boolean;
  /** Open a line's panel. */
  onOpen: (line: ShoppingLine) => void;
  /** While batch editing (OD-101): which lines are picked, and how to pick one. */
  selection?: RowSelection | undefined;
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
        // A checkbox column first while batch editing (OD-101), then pictures, if any. While
        // selecting, the rows' buttons step aside, so there's no button column (OD-104, Q102).
        selection
          ? withPictures
            ? 'isolate sm:grid-cols-[auto_auto_minmax(0,1fr)_auto]'
            : 'isolate sm:grid-cols-[auto_minmax(0,1fr)_auto]'
          : withPictures
            ? 'sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]'
            : 'sm:grid-cols-[minmax(0,1fr)_auto_auto]',
        className,
      )}
    >
      {lines.map((l) => (
        <li
          key={l.id}
          className={cn(
            // Tighter on a phone, so eight or more rows fit on screen (OD-137).
            'relative py-2.5 sm:col-span-full sm:grid sm:grid-cols-subgrid sm:py-4',
            // A picked row is tinted edge to edge (OD-104, Q101). Drawn behind the row, past the
            // list's side padding, so the subgrid's columns don't move.
            selection?.selected.has(l.id) &&
              'before:absolute before:inset-y-0 before:-right-4 before:-left-4 before:-z-10 before:bg-accent sm:before:-right-5 sm:before:-left-5',
          )}
        >
          <ShoppingRow
            line={l}
            canEdit={canEdit}
            files={files.filter((f) => f.ownerId === l.id)}
            pictureColumn={withPictures}
            onOpen={() => onOpen(l)}
            selection={selection}
            byStore={byStore}
          />
        </li>
      ))}
    </ul>
  );
}

/** Batch editing's picked lines (OD-101). */
export type RowSelection = {
  selected: ReadonlyMap<string, ShoppingLine>;
  toggle: (line: ShoppingLine) => void;
};

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
  selection,
  byStore,
}: {
  line: ShoppingLine;
  canEdit: boolean;
  files: FileView[];
  byStore: boolean;
  /** The list has a picture column on a laptop, so this row fills its cell even without one. */
  pictureColumn: boolean;
  onOpen: () => void;
  selection?: RowSelection | undefined;
}) {
  const phone = useIsPhone();
  const [buying, setBuying] = useState(false);
  // Fading out before the list refreshes, so the row visibly leaves To buy (OD-81).
  const [leaving, setLeaving] = useState(false);
  const [brokenThumb, setBrokenThumb] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  useReturnFocus(buying ? `line-purchase-${line.id}` : null);
  const thumb = files.find((f) => f.kind === 'product_image' && f.url);
  // The smallest copy there is for a 56px tile: 160px (OD-141), then 640px (OD-115, Q136),
  // then the original.
  const thumbSrc = thumb ? (thumb.tinyUrl ?? thumb.thumbUrl ?? thumb.url) : null;
  const receipts = files.filter((f) => f.kind === 'receipt');

  const details = (
    <Button
      type="button"
      variant="ghost"
      className={ROW_BUTTON}
      onClick={onOpen}
      data-return-focus={line.id}
    >
      <PanelRightOpen aria-hidden absoluteStrokeWidth strokeWidth={2} />
      Details
      <span className="sr-only"> for {line.name}</span>
    </Button>
  );
  // Laptop only: the phone row has its own (PhoneRow).
  const actions =
    buying || selection || phone ? null : (
      <div className="flex flex-nowrap items-center justify-end gap-2">
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
      ref={rowRef}
      className={cn(
        'flex flex-col gap-3 transition-[opacity,translate] duration-150 ease-out sm:col-span-full sm:grid sm:grid-cols-subgrid',
        leaving && '-translate-y-3 opacity-0',
        selection && 'cursor-pointer',
      )}
      // While selecting, a click anywhere on the row ticks it (OD-104, Q101). The checkbox stays
      // the keyboard way; links and controls in the row keep their own clicks.
      onClick={
        selection
          ? (e) => {
              if ((e.target as Element).closest('a, button, input, label')) return;
              selection.toggle(line);
            }
          : undefined
      }
    >
      {phone ? (
        <PhoneRow
          line={line}
          canEdit={canEdit}
          thumb={
            thumbSrc && brokenThumb !== thumbSrc ? (
              <img
                src={thumbSrc}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => setBrokenThumb(thumbSrc)}
                className="size-12 shrink-0 rounded-lg border border-border bg-inset object-cover"
              />
            ) : pictureColumn || thumbSrc ? (
              // A plain tile, so names line up down the list, as on a laptop (OD-145).
              <span
                aria-hidden
                className="size-12 shrink-0 rounded-lg border border-border bg-inset"
              />
            ) : null
          }
          onOpen={onOpen}
          selection={selection}
          buying={buying}
          onBuy={() => setBuying(true)}
          byStore={byStore}
        />
      ) : (
        // Laptop: one line per item, in the list's shared columns.
        <div
          className={cn(
            'grid items-start gap-x-3 gap-y-3 sm:col-span-full sm:grid-cols-subgrid sm:items-center sm:gap-x-4',
            selection
              ? thumbSrc
                ? 'grid-cols-[auto_auto_minmax(0,1fr)_auto]'
                : 'grid-cols-[auto_minmax(0,1fr)_auto]'
              : thumbSrc
                ? 'grid-cols-[auto_minmax(0,1fr)_auto]'
                : 'grid-cols-[minmax(0,1fr)_auto]',
          )}
        >
          {selection ? <RowCheckbox line={line} selection={selection} /> : null}
          {thumbSrc && brokenThumb === thumbSrc ? (
            // A picture that won't load leaves a plain tile, not a gap (OD-106, Q110).
            <span
              aria-hidden
              className="size-14 shrink-0 rounded-lg border border-border bg-inset"
            />
          ) : thumbSrc ? (
            <img
              src={thumbSrc}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setBrokenThumb(thumbSrc)}
              className="size-14 shrink-0 rounded-lg border border-border bg-inset object-cover"
            />
          ) : pictureColumn ? (
            // A plain tile, so the picture column never looks like a gap (OD-108, Q112).
            <span
              aria-hidden
              className="hidden size-14 shrink-0 rounded-lg border border-border bg-inset sm:block"
            />
          ) : null}
          <div className="min-w-0">
            {/* The name opens the panel too (OD-101, Q90). It looks like plain text until
                hovered, and stays out of Tab order: Details is the keyboard way in. */}
            <button
              type="button"
              tabIndex={-1}
              // While selecting, the name ticks the row like the rest of it does (OD-104).
              onClick={selection ? () => selection.toggle(line) : onOpen}
              className={cn(
                'text-left text-lg font-semibold break-words underline-offset-4',
                !selection && 'hover:underline',
              )}
            >
              {line.name}
            </button>
            <LineFacts line={line} byStore={byStore} />
          </div>
          <LineAmount line={line} className="text-right text-xl" />
          {actions ? <div className="col-span-1">{actions}</div> : null}
        </div>
      )}
      {buying ? (
        <div className="sm:col-span-full">
          <PurchaseForm
            line={line}
            onDone={() => setBuying(false)}
            onLeaving={async (refresh) => {
              const next = focusAfterLeaving(rowRef.current);
              setLeaving(true);
              await new Promise((done) => setTimeout(done, 150));
              await refresh();
              // Where the list shows every status, the row stays: bring it back.
              setLeaving(false);
              next();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Where focus goes once a row has left To buy (OD-78): the next row's Mark as purchased (or its
 * name, when it has none), else the one before, else the section's heading, so it never falls
 * to the top of the page. Worked out before the row goes, applied after the list refreshes,
 * and only if focus was lost (where the list shows every status, the row stays).
 */
function focusAfterLeaving(row: HTMLElement | null): () => void {
  const li = row?.closest('li');
  const keyIn = (el: Element | null | undefined) => {
    if (!el) return null;
    const target =
      el.querySelector<HTMLElement>('[data-return-focus^="line-purchase-"]') ??
      el.querySelector<HTMLElement>('[data-return-focus]');
    return target?.dataset.returnFocus ?? null;
  };
  const key = keyIn(li?.nextElementSibling) ?? keyIn(li?.previousElementSibling);
  const section = li?.closest<HTMLElement>('section[aria-labelledby]');
  const headingId = section?.getAttribute('aria-labelledby');
  return () =>
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      const target = key
        ? document.querySelector<HTMLElement>(`[data-return-focus="${CSS.escape(key)}"]`)
        : null;
      if (target) return target.focus();
      const heading = headingId ? document.getElementById(headingId) : null;
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    });
}

/** The tick box that picks a row while batch editing (OD-101). */
function RowCheckbox({ line, selection }: { line: ShoppingLine; selection: RowSelection }) {
  return (
    <label className="-my-2 -ml-2 flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center self-center">
      <input
        type="checkbox"
        checked={selection.selected.has(line.id)}
        onChange={() => selection.toggle(line)}
        className="size-5"
      />
      <span className="sr-only">Select {line.name}</span>
    </label>
  );
}

/**
 * What a line costs, as its status counts it: the price, "No price yet", "Paid $X", or
 * "Paid $X, $Y back", which breaks between its two parts rather than inside one (OD-136).
 */
function LineAmount({ line, className }: { line: ShoppingLine; className?: string }) {
  if (!lineHasAmount(line)) {
    // No price yet reads as that, not as something free (OD-106, Q105; OD-145).
    return (
      <span className={cn('whitespace-nowrap text-muted-foreground', className)}>
        {lineAmountText(line)}
      </span>
    );
  }
  return (
    <span className={cn('font-semibold text-foreground tabular-nums', className)}>
      {lineAmountText(line)
        .split(', ')
        .map((part, i) => (
          <span key={part}>
            {i > 0 ? ', ' : null}
            <span className="whitespace-nowrap">{part}</span>
          </span>
        ))}
    </span>
  );
}

/**
 * A row on a phone (OD-137): small enough that eight or more fit on screen. The picture, the
 * name, then the amount, store and details on one grey line, and one "Bought" button for things
 * still to buy. Tapping the row (or its name, the keyboard way in) opens its panel, where
 * receipts and everything else live.
 */
function PhoneRow({
  line,
  canEdit,
  thumb,
  onOpen,
  selection,
  buying,
  onBuy,
  byStore,
}: {
  line: ShoppingLine;
  canEdit: boolean;
  thumb: ReactNode;
  onOpen: () => void;
  selection?: RowSelection | undefined;
  buying: boolean;
  onBuy: () => void;
  byStore: boolean;
}) {
  const buyable = line.status === 'to_buy' && canEdit && !selection && !buying;
  // One line: tick box, picture, name, Bought. The name keeps at least 8rem, so at large text
  // Bought drops to its own line at the right instead of pushing the page sideways (OD-142).
  return (
    <div
      className={cn(
        'flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2',
        !selection && 'cursor-pointer',
      )}
      onClick={
        selection
          ? undefined
          : (e) => {
              if ((e.target as Element).closest('a, button, input, label')) return;
              onOpen();
            }
      }
    >
      {selection ? <RowCheckbox line={line} selection={selection} /> : null}
      {thumb}
      <div className="min-w-0 flex-1 basis-32">
        <button
          type="button"
          onClick={selection ? () => selection.toggle(line) : onOpen}
          data-return-focus={line.id}
          className="line-clamp-2 text-left font-semibold break-words"
        >
          {line.name}
          {selection ? null : <span className="sr-only">, details</span>}
        </button>
        <LineFacts line={line} lead={<LineAmount line={line} />} byStore={byStore} />
      </div>
      {buyable ? (
        <Button
          type="button"
          variant="outline"
          className="ml-auto gap-1.5 px-2.5"
          onClick={onBuy}
          data-return-focus={`line-purchase-${line.id}`}
        >
          <Check aria-hidden absoluteStrokeWidth strokeWidth={2} />
          Bought
          <span className="sr-only">: mark {line.name} as purchased</span>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The grey line under a name: the store as a link to the product page (or "Product page" when
 * there's a link but no store; plain text when there's no link), how many, and a planned phase
 * (OD-82, Q43).
 */
function LineFacts({
  line,
  lead,
  byStore = false,
}: {
  line: ShoppingLine;
  lead?: ReactNode;
  byStore?: boolean;
}) {
  const facts = lineDetails(line);
  // Under a store's heading the store goes without saying; the room is what tells two curtain
  // rods apart, and the product page stays a link (OD-144).
  const where = byStore ? lineWhere(line) : null;
  const store = line.link ? (
    <a
      href={line.link}
      target="_blank"
      rel="noreferrer"
      // 20px of text, but an invisible margin makes the tap area 44px tall (OD-96).
      className="relative inline-flex items-center gap-1 text-foreground underline underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-3"
    >
      {byStore ? 'Product page' : line.store || 'Product page'}
      <ExternalLink
        aria-hidden
        absoluteStrokeWidth
        strokeWidth={1.5}
        className="size-3.5 shrink-0"
      />
      <span className="sr-only"> for {line.name} (opens in a new tab)</span>
    </a>
  ) : line.store && !byStore ? (
    line.store
  ) : null;
  const parts = [lead, where, store, facts || null].filter((p) => p != null && p !== '');
  if (parts.length === 0) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 ? ', ' : null}
          {p}
        </Fragment>
      ))}
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
  const invalidate = useRefreshShopping();
  const toasts = useToasts();
  const update = useMutation(trpc.shoppingLines.update.mutationOptions());
  const undo = useMutation(trpc.shoppingLines.update.mutationOptions({ onSuccess: invalidate }));
  return (
    <AmountForm
      idPrefix={`buy-${line.id}`}
      label="What was paid"
      hint={
        line.priceCents > 0
          ? `The price was ${money(line.priceCents)}. Tax and delivery count too.`
          : 'It had no price yet. Tax and delivery count too.'
      }
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
              description: paidCents > 0 ? `${line.name}, ${money(paidCents)} paid` : line.name,
              // Twice Base UI's 5s default, so there's time to reach Undo (it also pauses
              // while hovered or focused).
              timeout: 10_000,
              actionProps: undoAction(toasts, () =>
                undo.mutateAsync({ id: line.id, status: 'to_buy' }),
              ),
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
    // Nothing to prefill reads as an empty field to fill in, not "0.00" (OD-145).
    defaultValues: { amount: initial > 0 ? centsToInput(initial) : '' },
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
        <MoneyInput id={`${idPrefix}-amount`} className="sm:max-w-48" {...register('amount')} />
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
