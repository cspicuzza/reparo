import { Check, ExternalLink } from 'lucide-react';
import { moneyInputSchema, shoppingLineCreateSchema } from '@reparo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AttachedFiles } from '@/components/attached-files';
import { AutoSaveField } from '@/components/auto-save-field';
import { AutoSaveSelect } from '@/components/auto-save-select';
import { ConfirmRemove } from '@/components/confirm-remove';
import { EditPanel } from '@/components/edit-panel';
import { FileSection } from '@/components/file-section';
import { FormError, Input } from '@/components/form';
import { ShoppingStatusBadge } from '@/components/money';
import { FormPlaceholder } from '@/components/placeholder';
import { Button, buttonVariants } from '@/components/ui/button';
import { centsToInput, lineAmountText, money } from '@/lib/money';
import { problemWith } from '@/lib/problem';
import { lineWhere, type ShoppingLine } from '@/lib/shopping';
import { useToasts } from '@/lib/toasts';
import { trpcClient, useTRPC } from '@/lib/trpc';
import type { FileView } from '@/lib/upload';
import { useInvalidateShopping } from '@/lib/use-invalidate-shopping';
import { PHASE_STATUS_LABEL } from '@/lib/work';
import { AmountForm } from './shopping-list';

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
  const invalidate = useInvalidateShopping();
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
    <AutoSaveField
      id={`line-name-${line.id}`}
      label="Name"
      labelClassName="sr-only"
      initial={line.name}
      what={`Name of ${line.name}`}
      inputClassName="-mx-2 border-transparent bg-transparent px-2 text-2xl [font-stretch:74%] font-[640] tracking-[-0.01em] hover:border-input focus:border-input"
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
      inputClassName={SHORT}
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
  const invalidate = useInvalidateShopping();
  const save = useSaveLine(line.id);
  const phases = useQuery(trpc.phases.list.queryOptions());
  const rooms = useQuery(trpc.rooms.list.queryOptions());
  const categories = useQuery(trpc.categories.list.queryOptions());
  const jobs = useQuery(trpc.jobs.list.queryOptions());
  // Suggestions only; nothing waits for them.
  const stores = useQuery(trpc.shoppingLines.stores.queryOptions());
  const [renaming, setRenaming] = useState(false);
  const remove = useMutation(
    trpc.shoppingLines.remove.mutationOptions({
      onSuccess: async () => {
        onRemoved();
        await invalidate();
      },
    }),
  );

  if (phases.isPending || rooms.isPending || categories.isPending || jobs.isPending) {
    return <FormPlaceholder label="Loading the line" fields={6} />;
  }
  if (phases.error || rooms.error || categories.error || jobs.error) {
    const message = (phases.error ?? rooms.error ?? categories.error ?? jobs.error)?.message;
    return <p role="alert">Couldn&apos;t load: {message}</p>;
  }

  const id = (f: string) => `line-${line.id}-${f}`;
  const pictures = files.filter((f) => f.kind === 'product_image');
  const receipts = files.filter((f) => f.kind === 'receipt');
  const phaseJobs = jobs.data.filter((j) => j.phaseId === line.phaseId);

  return (
    <div className="flex flex-col gap-4">
      <FileSection
        id={`panel-pictures-${line.id}`}
        title="Pictures"
        files={pictures}
        target={() => ({ ownerType: 'shopping_line', ownerId: line.id, kind: 'product_image' })}
        uploadLabel="Add pictures"
        emptyText="No pictures yet. Copy one from the store's page and paste it below."
        canEdit
        gridClassName="grid-cols-2 sm:grid-cols-2 lg:grid-cols-2"
      />

      {/* Each field keeps a line under it for Saved, so the gap between fields stays small. */}
      <MoneyField
        id={id('price')}
        label="Price"
        hint="The whole line, all of them."
        cents={line.priceCents}
        field="priceCents"
        line={line}
      />

      <StatusStep line={line} />

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
          hint="Pick one you've used or type a new one."
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
        {line.store ? (
          renaming ? (
            <RenameStore store={line.store} onDone={() => setRenaming(false)} />
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="-ml-3"
              onClick={() => setRenaming(true)}
            >
              Rename this store everywhere
            </Button>
          )
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

      <div className="-ml-3 flex flex-wrap items-center gap-1 border-t border-border pt-4">
        <ConfirmRemove
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
 * The status and its one next step. Buying and returning ask for the amount first, with a
 * button, because they change the line's status (Q48). "Back to To buy" clears the amounts.
 */
function StatusStep({ line }: { line: ShoppingLine }) {
  const trpc = useTRPC();
  const invalidate = useInvalidateShopping();
  const toasts = useToasts();
  const [step, setStep] = useState<'view' | 'purchase' | 'return'>('view');
  const update = useMutation(trpc.shoppingLines.update.mutationOptions());
  const back = () => setStep('view');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <ShoppingStatusBadge status={line.status} />
        {line.status !== 'to_buy' ? (
          <span className="font-semibold tabular-nums">{lineAmountText(line)}</span>
        ) : null}
      </div>
      {step === 'purchase' ? (
        <AmountForm
          idPrefix={`panel-buy-${line.id}`}
          label="What was paid"
          hint={`The price was ${money(line.priceCents)}. Tax and delivery count too.`}
          initial={line.priceCents}
          submitLabel="Mark as purchased"
          serverError={update.error?.message}
          onCancel={back}
          onSubmit={async (paidCents) => {
            await update
              .mutateAsync({ id: line.id, status: 'purchased', paidCents })
              .then(async () => {
                await invalidate();
                back();
                toasts.add({
                  title: 'Marked as purchased',
                  description: `${line.name}, ${money(paidCents)} paid`,
                });
              })
              .catch(() => undefined);
          }}
        />
      ) : step === 'return' ? (
        <AmountForm
          idPrefix={`panel-return-${line.id}`}
          label="How much came back"
          hint={`${money(line.paidCents ?? 0)} was paid. Anything kept back, like a restocking fee, stays spent.`}
          initial={line.paidCents ?? 0}
          submitLabel="Mark as returned"
          serverError={update.error?.message}
          onCancel={back}
          onSubmit={async (refundCents) => {
            await update
              .mutateAsync({ id: line.id, status: 'returned', refundCents })
              .then(async () => {
                await invalidate();
                back();
              })
              .catch(() => undefined);
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {line.status === 'to_buy' ? (
            <Button type="button" variant="outline" onClick={() => setStep('purchase')}>
              <Check aria-hidden absoluteStrokeWidth strokeWidth={2} />
              Mark as purchased
            </Button>
          ) : null}
          {line.status === 'purchased' ? (
            <Button type="button" variant="outline" onClick={() => setStep('return')}>
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
                  .then(invalidate)
                  .catch(() => undefined)
              }
            >
              Back to To buy
            </Button>
          ) : null}
        </div>
      )}
      {step === 'view' && update.error ? <FormError>{update.error.message}</FormError> : null}
    </div>
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
  const invalidate = useInvalidateShopping();
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
