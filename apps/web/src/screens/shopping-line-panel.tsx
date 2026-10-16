import { ExternalLink } from 'lucide-react';
import {
  moneyInputSchema,
  SHOPPING_STATUSES,
  shoppingLineCreateSchema,
  type ShoppingStatusInput as ShoppingStatus,
} from '@reparo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { AttachedFiles } from '@/components/attached-files';
import { AutoSaveField } from '@/components/auto-save-field';
import { AutoSaveSelect } from '@/components/auto-save-select';
import { ConfirmRemove } from '@/components/confirm-remove';
import { EditPanel } from '@/components/edit-panel';
import { PanelGroup } from '@/components/panel-group';
import { PanelNameField } from '@/components/panel-name-field';
import { FileSection } from '@/components/file-section';
import { DollarBox, FormError, Input } from '@/components/form';
import { ShoppingStatusBadge } from '@/components/money';
import { FormPlaceholder } from '@/components/placeholder';
import { SaveProblem, SaveStatus } from '@/components/save-state';
import { Button, buttonVariants } from '@/components/ui/button';
import { LoadError } from '@/components/load-error';
import { centsToInput, lineAmountText, money, SHOPPING_STATUS_LABEL } from '@/lib/money';
import { problemWith } from '@/lib/problem';
import { lineWhere, type ShoppingLine } from '@/lib/shopping';
import { useToasts } from '@/lib/toasts';
import { trpcClient, useTRPC } from '@/lib/trpc';
import type { FileView } from '@/lib/upload';
import { useRefreshShopping } from '@/lib/refresh';
import { cn } from '@/lib/utils';
import { PHASE_STATUS_LABEL } from '@/lib/work';

type LinePatch = Omit<Parameters<typeof trpcClient.shoppingLines.update.mutate>[0], 'id'>;

/** Short fields (money, how many) keep a short width, one per line (OD-82, Q52). */
const SHORT = 'max-w-48';

/**
 * A shopping line in the side panel (Workflow polish, OD-79; reworked in OD-82). Editors get
 * the line ready to edit, with no Edit button: the title is the name field, every field saves
 * when you leave it and every dropdown when you pick, with Saved beside it (Q37–Q53). Money
 * saves the same way and offers Undo for 10 seconds. Marking as purchased or returned still
 * asks for the amount, with a button, because it changes the line's status. Viewers get the
 * line to read.
 */
export function ShoppingLinePanel({
  line,
  files,
  canEdit,
  onClose,
}: {
  /** The line to show, or undefined when the panel is closed. */
  line: ShoppingLine | undefined;
  files: FileView[];
  canEdit: boolean;
  onClose: () => void;
}) {
  const own = line ? files.filter((f) => f.ownerId === line.id) : [];
  return (
    <EditPanel
      open={line !== undefined}
      title={line?.name ?? 'Shopping'}
      focusFirstField={false}
      heading={canEdit && line ? <NameField key={line.id} line={line} /> : undefined}
      onClose={onClose}
    >
      {line ? (
        canEdit ? (
          <EditBody key={line.id} line={line} files={own} onRemoved={onClose} />
        ) : (
          <ReadBody key={line.id} line={line} files={own} />
        )
      ) : null}
    </EditPanel>
  );
}

/** Save part of a line, then refresh everything that shows it. Returns the saved line. */
function useSaveLine(id: string) {
  const invalidate = useRefreshShopping();
  return async (patch: LinePatch) => {
    const saved = await trpcClient.shoppingLines.update.mutate({ id, ...patch });
    await invalidate();
    return saved;
  };
}

/** The name, as the panel's heading, editable in place (Q39). */
function NameField({ line }: { line: ShoppingLine }) {
  const save = useSaveLine(line.id);
  return (
    <PanelNameField
      id={`line-name-${line.id}`}
      initial={line.name}
      what={`Name of ${line.name}`}
      validate={(v) => problemWith(shoppingLineCreateSchema.shape.name, v)}
      onSave={(v) => save({ name: v })}
    />
  );
}

/**
 * Money that saves when you leave it, then says what changed with Undo for 10 seconds (Q37,
 * Q48): a typo that moves the totals is one click to take back.
 */
function MoneyField({
  id,
  label,
  hint,
  cents,
  field,
  line,
}: {
  id: string;
  label: string;
  hint?: string;
  cents: number;
  field: 'priceCents' | 'paidCents' | 'refundCents';
  line: ShoppingLine;
}) {
  const save = useSaveLine(line.id);
  const toasts = useToasts();
  return (
    <AutoSaveField
      id={id}
      label={label}
      {...(hint ? { hint } : {})}
      initial={centsToInput(cents)}
      inputMode="decimal"
      inputClassName={cn(SHORT, 'pl-7')}
      wrap={(field) => <DollarBox>{field}</DollarBox>}
      what={`${label} for ${line.name}`}
      validate={(v) => problemWith(moneyInputSchema, v)}
      onSave={async (v) => {
        const saved = await save({ [field]: v });
        const now = saved[field] ?? 0;
        toasts.add({
          title: `${label} changed`,
          description: `${line.name}: from ${money(cents)} to ${money(now)}`,
          timeout: 10_000,
          actionProps: {
            children: 'Undo',
            onClick: () => void save({ [field]: centsToInput(cents) }).catch(() => undefined),
          },
        });
      }}
    />
  );
}

function EditBody({
  line,
  files,
  onRemoved,
}: {
  line: ShoppingLine;
  files: FileView[];
  onRemoved: () => void;
}) {
  const trpc = useTRPC();
  const toasts = useToasts();
  const invalidate = useRefreshShopping();
  const save = useSaveLine(line.id);
  const phases = useQuery(trpc.phases.list.queryOptions());
  const rooms = useQuery(trpc.rooms.list.queryOptions());
  const categories = useQuery(trpc.categories.list.queryOptions());
  const jobs = useQuery(trpc.jobs.list.queryOptions());
  // Suggestions only; nothing waits for them.
  const stores = useQuery(trpc.shoppingLines.stores.queryOptions());
  const [renaming, setRenaming] = useState(false);
  const renameLink = useRef<HTMLButtonElement>(null);
  // Removing one line offers the same 10 seconds of Undo as removing many (OD-103).
  const remove = useMutation(
    trpc.shoppingLines.remove.mutationOptions({
      onSuccess: async () => {
        onRemoved();
        await invalidate();
        toasts.add({
          title: `Removed ${line.name}`,
          timeout: 10_000,
          actionProps: {
            children: 'Undo',
            onClick: () =>
              void trpcClient.shoppingLines.restore
                .mutate({ id: line.id })
                .then(invalidate)
                .catch(() => undefined),
          },
        });
      },
    }),
  );

  if (phases.isPending || rooms.isPending || categories.isPending || jobs.isPending) {
    return <FormPlaceholder label="Loading the line" fields={6} />;
  }
  if (phases.error || rooms.error || categories.error || jobs.error) {
    return (
      <LoadError
        what="this line's details"
        error={phases.error ?? rooms.error ?? categories.error ?? jobs.error}
        retry={[phases, rooms, categories, jobs]}
      />
    );
  }

  const id = (f: string) => `line-${line.id}-${f}`;
  const pictures = files.filter((f) => f.kind === 'product_image');
  const receipts = files.filter((f) => f.kind === 'receipt');
  const phaseJobs = jobs.data.filter((j) => j.phaseId === line.phaseId);

  return (
    <div className="flex flex-col gap-4">
      <PanelGroup id={id('buying')} title="Buying">
        <MoneyField
          id={id('price')}
          label="Price"
          hint="The whole line, all of them."
          cents={line.priceCents}
          field="priceCents"
          line={line}
        />

        {/* How many sits with the price it multiplies (OD-106, Q108). */}
        <AutoSaveField
          id={id('qty')}
          label="How many"
          inputMode="numeric"
          inputClassName={SHORT}
          initial={String(line.quantity)}
          what={`How many for ${line.name}`}
          validate={(v) => problemWith(shoppingLineCreateSchema.shape.quantity, Number(v))}
          onSave={(v) => save({ quantity: Number(v) })}
        />

        <PurchaseStatus line={line} />

        {line.status !== 'to_buy' ? (
          <MoneyField
            id={id('paid')}
            label="What was paid"
            hint="Tax and delivery count too."
            cents={line.paidCents ?? 0}
            field="paidCents"
            line={line}
          />
        ) : null}
        {line.status === 'returned' ? (
          <MoneyField
            id={id('refund')}
            label="How much came back"
            hint="Anything kept back, like a restocking fee, stays spent."
            cents={line.refundCents ?? 0}
            field="refundCents"
            line={line}
          />
        ) : null}

        <div>
          <AutoSaveField
            id={id('store')}
            label="Store"
            hint={
              <>
                Pick one you&apos;ve used or type a new one.
                {line.store ? (
                  <>
                    {' '}
                    {/* A quiet link at the end of the hint, not a floating button (OD-126, Q174). */}
                    <button
                      type="button"
                      className="relative text-foreground underline underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-3 hover:decoration-2"
                      ref={renameLink}
                      aria-expanded={renaming}
                      onClick={() => setRenaming(true)}
                    >
                      Rename {line.store} everywhere…
                    </button>
                  </>
                ) : null}
              </>
            }
            list={id('stores')}
            initial={line.store}
            what={`Store for ${line.name}`}
            validate={(v) => problemWith(shoppingLineCreateSchema.shape.store, v)}
            onSave={(v) => save({ store: v })}
          />
          {/* The browser's own suggestions as you type (OD-69). */}
          <datalist id={id('stores')}>
            {(stores.data ?? []).map((st) => (
              <option key={st.name} value={st.name} />
            ))}
          </datalist>
          {line.store && renaming ? (
            <RenameStore
              store={line.store}
              onDone={() => {
                setRenaming(false);
                renameLink.current?.focus();
              }}
            />
          ) : null}
        </div>

        <div>
          <AutoSaveField
            id={id('link')}
            label="Link"
            type="url"
            inputMode="url"
            initial={line.link}
            what={`Link for ${line.name}`}
            validate={(v) => problemWith(shoppingLineCreateSchema.shape.link, v)}
            onSave={(v) => save({ link: v })}
          />
          {line.link ? <ProductLink href={line.link} text="Open product page" /> : null}
        </div>
      </PanelGroup>

      {/* Below Buying, so price and status are the first thing the panel shows (Q108). */}
      <FileSection
        id={`panel-pictures-${line.id}`}
        title="Pictures"
        files={pictures}
        target={() => ({ ownerType: 'shopping_line', ownerId: line.id, kind: 'product_image' })}
        uploadLabel="Add pictures"
        emptyText="No pictures yet. Copy one from the store's page and paste it here."
        canEdit
        gridClassName="grid-cols-2 sm:grid-cols-2 lg:grid-cols-2"
      />

      <PanelGroup id={id('where')} title="Where it goes">
        <AutoSaveSelect
          id={id('room')}
          label="Room"
          value={line.roomId ?? ''}
          options={[
            { value: '', label: 'Whole house' },
            ...rooms.data.map((r) => ({ value: r.id, label: r.name })),
          ]}
          what={`Room for ${line.name}`}
          onSave={(v) => save({ roomId: v === '' ? null : v })}
        />
        <AutoSaveSelect
          id={id('category')}
          label="Category"
          value={line.categoryId}
          options={categories.data.map((c) => ({ value: c.id, label: c.name }))}
          what={`Category for ${line.name}`}
          onSave={(v) => save({ categoryId: v })}
        />
        <AutoSaveSelect
          id={id('phase')}
          label="Phase"
          hint="Planned phases don't count against the money yet."
          value={line.phaseId}
          options={phases.data.map((p) => ({
            value: p.id,
            label: `${p.name} (${PHASE_STATUS_LABEL[p.status].toLowerCase()})`,
          }))}
          what={`Phase for ${line.name}`}
          onSave={async (phaseId) => {
            // A line's job must be in its phase, so moving phase lets go of a job left behind.
            const job = jobs.data.find((j) => j.id === line.jobId);
            const dropJob = job !== undefined && job.phaseId !== phaseId;
            await save(dropJob ? { phaseId, jobId: null } : { phaseId });
            if (dropJob) {
              toasts.add({
                title: 'No longer for a job',
                description: `${job.name} is in another phase, so ${line.name} isn't for it now.`,
              });
            }
          }}
        />
        <AutoSaveSelect
          id={id('job')}
          label="For a job"
          hint="Like tile for the flooring job. Only this phase's jobs."
          value={line.jobId ?? ''}
          options={[
            { value: '', label: 'No job' },
            ...phaseJobs.map((j) => ({ value: j.id, label: j.name })),
          ]}
          what={`Job for ${line.name}`}
          onSave={(v) => save({ jobId: v === '' ? null : v })}
        />
      </PanelGroup>

      <PanelGroup id={id('more')} title="More">
        <AutoSaveField
          id={id('model')}
          label="Model number"
          initial={line.modelNumber}
          what={`Model number for ${line.name}`}
          validate={(v) => problemWith(shoppingLineCreateSchema.shape.modelNumber, v)}
          onSave={(v) => save({ modelNumber: v })}
        />
        <AutoSaveField
          id={id('notes')}
          label="Notes"
          multiline
          rows={4}
          initial={line.notes}
          what={`Notes for ${line.name}`}
          validate={(v) => problemWith(shoppingLineCreateSchema.shape.notes, v)}
          onSave={(v) => save({ notes: v })}
        />
      </PanelGroup>

      {line.status !== 'to_buy' ? (
        <section aria-labelledby={`receipts-${line.id}`}>
          <h3 id={`receipts-${line.id}`} className="text-base font-semibold">
            Receipts
          </h3>
          <div className="mt-1">
            <AttachedFiles
              files={receipts}
              target={{ ownerType: 'shopping_line', ownerId: line.id, kind: 'receipt' }}
              addLabel="Attach receipt"
              canEdit
              what="receipt"
            />
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-1 border-t border-border pt-4">
        <ConfirmRemove
          strong
          what={line.name}
          disabled={remove.isPending}
          onConfirm={() => remove.mutate({ id: line.id })}
        />
        {remove.error ? <FormError className="w-full">{remove.error.message}</FormError> : null}
      </div>
    </div>
  );
}

/**
 * Purchase status as a three-way switch (OD-85, Q67): To buy, Purchased, Returned. Picking one
 * saves straight away and offers Undo for 10 seconds. Purchased takes the price as what was
 * paid and Returned takes what was paid as what came back; the amounts then show below to
 * correct. Returned can only follow Purchased.
 */
function PurchaseStatus({ line }: { line: ShoppingLine }) {
  const save = useSaveLine(line.id);
  const toasts = useToasts();
  const change = useMutation({
    mutationFn: async (next: ShoppingStatus) => {
      const before = line;
      const patch: LinePatch =
        next === 'purchased'
          ? before.status === 'to_buy'
            ? { status: 'purchased', paidCents: centsToInput(before.priceCents) }
            : { status: 'purchased' }
          : next === 'returned'
            ? { status: 'returned', refundCents: centsToInput(before.paidCents ?? 0) }
            : { status: 'to_buy' };
      const saved = await save(patch);
      toasts.add({
        title: `Marked as ${SHOPPING_STATUS_LABEL[next].toLowerCase()}`,
        description:
          next === 'purchased'
            ? `${before.name}, ${money(saved.paidCents ?? 0)} paid`
            : next === 'returned'
              ? `${before.name}, ${money(saved.refundCents ?? 0)} back`
              : before.name,
        timeout: 10_000,
        actionProps: {
          children: 'Undo',
          // Put back the status and the amounts it had.
          onClick: () =>
            void save({
              status: before.status,
              ...(before.paidCents !== null ? { paidCents: centsToInput(before.paidCents) } : {}),
              ...(before.refundCents !== null
                ? { refundCents: centsToInput(before.refundCents) }
                : {}),
            }).catch(() => undefined),
        },
      });
    },
  });
  const shown = change.isPending && change.variables ? change.variables : line.status;
  const index = SHOPPING_STATUSES.indexOf(shown);
  const id = `line-${line.id}-status`;
  const what = `Purchase status of ${line.name}`;

  return (
    <fieldset aria-describedby={line.status === 'to_buy' ? `${id}-hint` : undefined}>
      {/* The legend is read out; the visible copy shares its line with the save state. */}
      <legend className="sr-only">Purchase status</legend>
      <div className="flex items-baseline justify-between gap-3">
        <span aria-hidden className="text-sm font-semibold">
          Purchase status
        </span>
        <SaveStatus mutation={change} what={what} />
      </div>
      <div className="relative mt-1.5 flex rounded-lg border border-input bg-inset p-0.5">
        <span
          aria-hidden
          className="absolute inset-y-0.5 left-0.5 w-[calc((100%-0.25rem)/3)] rounded-md bg-card shadow-sm transition-transform duration-200 ease-out"
          style={{ transform: `translateX(${index * 100}%)` }}
        />
        {SHOPPING_STATUSES.map((st) => {
          const off = st === 'returned' && line.status === 'to_buy';
          return (
            <label
              key={st}
              className={cn(
                'relative z-10 flex min-h-11 flex-1 items-center justify-center rounded-md px-2 text-base transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-solid',
                shown === st ? 'font-semibold text-foreground' : 'text-muted-foreground',
                off ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:text-foreground',
              )}
            >
              <input
                type="radio"
                name={id}
                value={st}
                checked={shown === st}
                disabled={off || change.isPending}
                onChange={() => change.mutate(st)}
                className="sr-only"
              />
              {SHOPPING_STATUS_LABEL[st]}
            </label>
          );
        })}
      </div>
      {change.status === 'error' ? (
        <SaveProblem
          mutation={change}
          onRetry={() => {
            if (change.variables) change.mutate(change.variables);
          }}
        />
      ) : line.status === 'to_buy' ? (
        // Read out, not shown: the greyed-out Returned already says it (OD-97).
        <p id={`${id}-hint`} className="sr-only">
          Returned opens up once it&apos;s purchased.
        </p>
      ) : null}
    </fieldset>
  );
}

/** A text link to the store's page, opening in a new tab (Q43). */
function ProductLink({ href, text }: { href: string; text: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="mt-1.5 inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-4"
    >
      {text}
      <ExternalLink aria-hidden className="size-4 shrink-0" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Viewers read the line: pictures, price and status, notes, the details and receipts. */
function ReadBody({ line, files }: { line: ShoppingLine; files: FileView[] }) {
  const pictures = files.filter((f) => f.kind === 'product_image');
  const receipts = files.filter((f) => f.kind === 'receipt');
  const details: [string, string][] = [
    ['Room', lineWhere(line)],
    ['Category', line.category.name],
    ['Store', line.store || 'Not set'],
    ['How many', String(line.quantity)],
    ['Phase', line.phase.status === 'planned' ? `${line.phase.name} (planned)` : line.phase.name],
    ['For a job', line.job?.name ?? 'No job'],
    ['Model number', line.modelNumber || 'Not set'],
  ];

  return (
    <div className="flex flex-col gap-6">
      {pictures.length > 0 ? (
        <FileSection
          id={`panel-pictures-${line.id}`}
          title="Pictures"
          files={pictures}
          target={() => ({ ownerType: 'shopping_line', ownerId: line.id, kind: 'product_image' })}
          uploadLabel="Add pictures"
          emptyText=""
          canEdit={false}
          gridClassName="grid-cols-2 sm:grid-cols-2 lg:grid-cols-2"
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-2xl font-semibold tabular-nums">{lineAmountText(line)}</span>
        <ShoppingStatusBadge status={line.status} />
      </div>

      {line.link ? (
        <a
          href={line.link}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: 'outline', className: 'self-start' })}
        >
          Open product page
          <ExternalLink aria-hidden className="size-4" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : null}

      {line.notes ? (
        <section aria-labelledby={`notes-${line.id}`}>
          <h3 id={`notes-${line.id}`} className="text-base font-semibold">
            Notes
          </h3>
          <p className="mt-1 max-w-prose whitespace-pre-wrap">{line.notes}</p>
        </section>
      ) : null}

      <section aria-labelledby={`details-${line.id}`}>
        <h3 id={`details-${line.id}`} className="text-base font-semibold">
          Details
        </h3>
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
          {details.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {receipts.length > 0 ? (
        <section aria-labelledby={`receipts-${line.id}`}>
          <h3 id={`receipts-${line.id}`} className="text-base font-semibold">
            Receipts
          </h3>
          <div className="mt-1">
            <AttachedFiles
              files={receipts}
              target={{ ownerType: 'shopping_line', ownerId: line.id, kind: 'receipt' }}
              addLabel="Attach receipt"
              canEdit={false}
              what="receipt"
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** "Rename this store everywhere" (OD-69): fixes the spelling on every line that uses it. */
function RenameStore({ store, onDone }: { store: string; onDone: () => void }) {
  const trpc = useTRPC();
  const invalidate = useRefreshShopping();
  const [to, setTo] = useState(store);
  const rename = useMutation(
    trpc.shoppingLines.renameStore.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        onDone();
      },
    }),
  );
  return (
    <form
      className="mt-3 grid gap-3 rounded-xl border border-border bg-background p-3"
      onSubmit={(e) => {
        e.preventDefault();
        rename.mutate({ from: store, to });
      }}
    >
      <div>
        <label htmlFor="rename-store" className="block text-sm font-semibold">
          New name for {store}, on every line
        </label>
        <Input
          id="rename-store"
          className="mt-1.5"
          value={to}
          autoFocus
          maxLength={120}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={rename.isPending || to.trim() === '' || to === store}>
          Rename everywhere
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {rename.error ? <FormError>{rename.error.message}</FormError> : null}
    </form>
  );
}
