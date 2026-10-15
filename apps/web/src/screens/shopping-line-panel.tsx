import { Check, Pencil } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { AttachedFiles } from '@/components/attached-files';
import { ConfirmRemove } from '@/components/confirm-remove';
import { EditPanel } from '@/components/edit-panel';
import { FileSection } from '@/components/file-section';
import { FormError, Input } from '@/components/form';
import { ShoppingStatusBadge } from '@/components/money';
import { Button, buttonVariants } from '@/components/ui/button';
import { lineAmountText, money } from '@/lib/money';
import { lineWhere, type ShoppingLine } from '@/lib/shopping';
import { useToasts } from '@/lib/toasts';
import { useTRPC } from '@/lib/trpc';
import type { FileView } from '@/lib/upload';
import { useInvalidateShopping } from '@/lib/use-invalidate-shopping';
import { ShoppingLineForm } from './shopping-line-form';
import { AmountForm } from './shopping-list';

/**
 * A shopping line in the side panel (Workflow polish, OD-79; Q29–Q32). It opens as a view, in
 * the order you need it: pictures (how you recognise a product), name, price and status, the
 * next step, notes, the details, receipts, then Edit and Remove. Edit turns the panel into the
 * line's form with one labelled Save (price is money, so no auto-save here). Returns happen
 * only here. Viewers get the view without the actions.
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
  return (
    <EditPanel open={line !== undefined} title={line?.name ?? 'Shopping'} onClose={onClose}>
      {line ? (
        <LineBody
          key={line.id}
          line={line}
          files={files.filter((f) => f.ownerId === line.id)}
          canEdit={canEdit}
          onRemoved={onClose}
        />
      ) : null}
    </EditPanel>
  );
}

type Step = 'view' | 'edit' | 'purchase' | 'return' | 'rename';

function LineBody({
  line,
  files,
  canEdit,
  onRemoved,
}: {
  line: ShoppingLine;
  files: FileView[];
  canEdit: boolean;
  onRemoved: () => void;
}) {
  const trpc = useTRPC();
  const invalidate = useInvalidateShopping();
  const toasts = useToasts();
  const [step, setStep] = useState<Step>('view');
  const update = useMutation(trpc.shoppingLines.update.mutationOptions());
  const remove = useMutation(
    trpc.shoppingLines.remove.mutationOptions({
      onSuccess: async () => {
        onRemoved();
        await invalidate();
      },
    }),
  );
  const pictures = files.filter((f) => f.kind === 'product_image');
  const receipts = files.filter((f) => f.kind === 'receipt');
  const back = () => setStep('view');

  if (step === 'edit') {
    return (
      <ShoppingLineForm
        idPrefix={`line-${line.id}`}
        line={line}
        submitLabel="Save"
        serverError={update.error?.message}
        onCancel={() => {
          update.reset();
          back();
        }}
        onSubmit={async (v) => {
          await update
            .mutateAsync({ id: line.id, ...v })
            .then(async () => {
              await invalidate();
              back();
            })
            .catch(() => undefined);
        }}
      />
    );
  }

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
      {pictures.length > 0 || canEdit ? (
        <FileSection
          id={`panel-pictures-${line.id}`}
          title="Pictures"
          files={pictures}
          target={() => ({ ownerType: 'shopping_line', ownerId: line.id, kind: 'product_image' })}
          uploadLabel="Add pictures"
          emptyText="No pictures yet. Copy one from the store's page and paste it below."
          canEdit={canEdit}
          gridClassName="grid-cols-2 sm:grid-cols-2 lg:grid-cols-2"
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-2xl font-semibold tabular-nums">{lineAmountText(line)}</span>
        <ShoppingStatusBadge status={line.status} />
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
          {line.link ? (
            <a
              href={line.link}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: 'outline' })}
            >
              Open product page<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
          {canEdit && line.status === 'to_buy' ? (
            <Button type="button" variant="outline" onClick={() => setStep('purchase')}>
              <Check aria-hidden absoluteStrokeWidth strokeWidth={2} />
              Mark as purchased
            </Button>
          ) : null}
          {canEdit && line.status === 'purchased' ? (
            <Button type="button" variant="outline" onClick={() => setStep('return')}>
              Mark as returned
            </Button>
          ) : null}
          {canEdit && line.status !== 'to_buy' ? (
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
        {canEdit && line.store ? (
          step === 'rename' ? (
            <RenameStore store={line.store} onDone={back} />
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="mt-2 -ml-3"
              onClick={() => setStep('rename')}
            >
              Rename this store everywhere
            </Button>
          )
        ) : null}
      </section>

      {line.status !== 'to_buy' && (receipts.length > 0 || canEdit) ? (
        <section aria-labelledby={`receipts-${line.id}`}>
          <h3 id={`receipts-${line.id}`} className="text-base font-semibold">
            Receipts
          </h3>
          <div className="mt-1">
            <AttachedFiles
              files={receipts}
              target={{ ownerType: 'shopping_line', ownerId: line.id, kind: 'receipt' }}
              addLabel="Attach receipt"
              canEdit={canEdit}
              what="receipt"
            />
          </div>
        </section>
      ) : null}

      {canEdit ? (
        <div className="-ml-3 flex flex-wrap items-center gap-1 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={() => setStep('edit')}>
            <Pencil aria-hidden absoluteStrokeWidth strokeWidth={2} />
            Edit
            <span className="sr-only"> {line.name}</span>
          </Button>
          <ConfirmRemove
            what={line.name}
            disabled={remove.isPending}
            onConfirm={() => remove.mutate({ id: line.id })}
          />
          {remove.error ? <FormError className="w-full">{remove.error.message}</FormError> : null}
        </div>
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
      className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-background p-3"
      onSubmit={(e) => {
        e.preventDefault();
        rename.mutate({ from: store, to });
      }}
    >
      <div className="min-w-0 flex-1 basis-48">
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
      <Button type="submit" disabled={rename.isPending || to.trim() === '' || to === store}>
        Rename everywhere
      </Button>
      <Button type="button" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
      {rename.error ? <FormError className="w-full">{rename.error.message}</FormError> : null}
    </form>
  );
}
