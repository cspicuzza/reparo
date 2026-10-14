import { zodResolver } from '@hookform/resolvers/zod';
import type { RouterOutputs } from '@reparo/api';
import { itemCreateSchema, type ItemCreate, type ItemCreateInput } from '@reparo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, Input, inputClass } from '@/components/form';
import { useMe } from '@/lib/me';
import { useTRPC } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Panel, PanelList } from '@/components/panel';

type Item = RouterOutputs['items']['list'][number];
type Category = RouterOutputs['categories']['list'][number];

/**
 * The item catalog: kinds of work or purchase, grouped by category. Admin adds, edits
 * (name, category, order) and retires. Retired items stay on existing jobs and can be
 * restored; they're collapsed below.
 */
export function Items() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { isAdmin } = useMe();
  const items = useQuery(trpc.items.list.queryOptions({ includeRetired: true }));
  const categories = useQuery(trpc.categories.list.queryOptions());
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);

  const invalidate = () => queryClient.invalidateQueries(trpc.items.pathFilter());
  const create = useMutation(
    trpc.items.create.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setAdding(false);
      },
    }),
  );
  const update = useMutation(
    trpc.items.update.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setEditingId(null);
      },
    }),
  );

  const active = items.data?.filter((i) => i.retiredAt === null) ?? [];
  const retired = items.data?.filter((i) => i.retiredAt !== null) ?? [];
  const cats = categories.data ?? [];
  const groups = cats
    .map((c) => ({ category: c, items: active.filter((i) => i.categoryId === c.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        title="Items"
        description="The kinds of work and purchases, by category. Open one to see and add its jobs."
        action={
          isAdmin && !adding ? (
            <Button type="button" onClick={() => setAdding(true)}>
              Add an item
            </Button>
          ) : null
        }
      />

      {adding ? (
        <Panel aria-labelledby="new-item">
          <h2 id="new-item" className="text-2xl">
            New item
          </h2>
          <div className="mt-4">
            <ItemForm
              idPrefix="new-item"
              categories={cats}
              submitLabel="Add item"
              serverError={create.error?.message}
              onCancel={() => {
                create.reset();
                setAdding(false);
              }}
              onSubmit={async (values) => {
                await create.mutateAsync(values).catch(() => undefined);
              }}
            />
          </div>
        </Panel>
      ) : null}

      {items.isPending ? <p className="text-muted-foreground">Loading items…</p> : null}
      {items.error ? <p role="alert">Couldn&apos;t load items: {items.error.message}</p> : null}
      {categories.error ? (
        <p role="alert">Couldn&apos;t load categories: {categories.error.message}</p>
      ) : null}
      {items.data && categories.data && groups.length === 0 && !adding ? (
        <p className="text-muted-foreground">
          No items yet.{isAdmin ? ' Add the first one above.' : ''}
        </p>
      ) : null}
      {items.data && categories.data
        ? groups.map(({ category, items: inCategory }) => (
            <section key={category.id} aria-labelledby={`cat-${category.id}`}>
              <h2 id={`cat-${category.id}`} className="text-2xl">
                {category.name}
              </h2>
              <PanelList className="mt-3">
                {inCategory.map((item) =>
                  editingId === item.id ? (
                    <li key={item.id} className="p-4 sm:p-5">
                      <ItemForm
                        idPrefix={`item-${item.id}`}
                        item={item}
                        categories={cats}
                        submitLabel="Save"
                        serverError={update.error?.message}
                        onCancel={() => {
                          update.reset();
                          setEditingId(null);
                        }}
                        onSubmit={async (values) => {
                          await update
                            .mutateAsync({ id: item.id, ...values })
                            .catch(() => undefined);
                        }}
                      />
                    </li>
                  ) : (
                    <li key={item.id} className="flex items-center gap-2 pr-2 sm:pr-3">
                      <Link
                        to="/items/$itemId"
                        params={{ itemId: item.id }}
                        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 hover:bg-accent sm:px-5"
                      >
                        <span className="min-w-0 flex-1 py-2 text-lg font-semibold break-words">
                          {item.name}
                        </span>
                        <ChevronRight
                          aria-hidden
                          className="size-5 shrink-0 text-muted-foreground"
                        />
                      </Link>
                      {isAdmin ? (
                        <span className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            onClick={() => {
                              update.reset();
                              setEditingId(item.id);
                            }}
                            variant="ghost"
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: item.id, retired: true })}
                            variant="ghost"
                            className="text-muted-foreground"
                          >
                            Retire
                          </Button>
                        </span>
                      ) : null}
                    </li>
                  ),
                )}
              </PanelList>
            </section>
          ))
        : null}
      {update.error && editingId === null ? (
        <p role="alert" className="text-sm">
          {update.error.message}
        </p>
      ) : null}

      {retired.length > 0 ? (
        <div>
          <Button
            type="button"
            variant="link"
            onClick={() => setShowRetired((v) => !v)}
            aria-expanded={showRetired}
            className="px-0 text-muted-foreground"
          >
            {showRetired ? 'Hide' : 'Show'} {retired.length} retired{' '}
            {retired.length === 1 ? 'item' : 'items'}
          </Button>
          {showRetired ? (
            <PanelList className="mt-3">
              {retired.map((item) => (
                <li
                  key={item.id}
                  className="flex min-h-14 items-center justify-between gap-4 px-4 py-2 text-muted-foreground sm:px-5"
                >
                  <span>
                    {item.name}
                    <span className="ml-2 text-sm">Retired</span>
                  </span>
                  {isAdmin ? (
                    <Button
                      type="button"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: item.id, retired: false })}
                      variant="ghost"
                    >
                      Restore
                    </Button>
                  ) : null}
                </li>
              ))}
            </PanelList>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type FormProps = {
  item?: Item;
  categories: Category[];
  onSubmit: (values: ItemCreate) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  serverError?: string | undefined;
  idPrefix: string;
};

function ItemForm({
  item,
  categories,
  onSubmit,
  onCancel,
  submitLabel,
  serverError,
  idPrefix,
}: FormProps) {
  const misc = categories.find((c) => c.name === 'Misc')?.id;
  const { register, handleSubmit, formState } = useForm<ItemCreateInput, unknown, ItemCreate>({
    resolver: zodResolver(itemCreateSchema),
    defaultValues: {
      name: item?.name ?? '',
      categoryId: item?.categoryId ?? misc,
      sortOrder: item?.sortOrder ?? 0,
    },
  });
  const id = (f: string) => `${idPrefix}-${f}`;
  return (
    <form
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      className="grid gap-4 sm:grid-cols-[1fr_12rem_6rem_auto] sm:items-end"
    >
      <Field label="Name" htmlFor={id('name')} error={formState.errors.name?.message}>
        <Input
          id={id('name')}
          autoComplete="off"
          autoFocus={item !== undefined}
          {...register('name')}
        />
      </Field>
      <Field label="Category" htmlFor={id('category')} error={formState.errors.categoryId?.message}>
        <select id={id('category')} className={inputClass} {...register('categoryId')}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Order" htmlFor={id('order')} error={formState.errors.sortOrder?.message}>
        <Input
          id={id('order')}
          type="number"
          min={0}
          step={1}
          {...register('sortOrder', { valueAsNumber: true })}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={formState.isSubmitting}>
          {submitLabel}
        </Button>
        <Button type="button" onClick={onCancel} variant="ghost">
          Cancel
        </Button>
      </div>
      {serverError ? (
        <p role="alert" className="text-sm sm:col-span-4">
          {serverError}
        </p>
      ) : null}
    </form>
  );
}
