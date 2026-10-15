import { useReturnFocus } from '@/lib/editor-focus';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Select } from '@/components/form';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { PlanGrid } from '@/components/plan-grid';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { SHOPPING_STATUS_LABEL } from '@/lib/money';
import { shoppingFilter, type ShoppingSearch } from '@/lib/shopping';
import { useTRPC } from '@/lib/trpc';
import { useInvalidateShopping } from '@/lib/use-invalidate-shopping';
import { CategoriesAdmin } from './categories-admin';
import { ShoppingLineForm } from './shopping-line-form';
import { ShoppingList } from './shopping-list';

const route = getRouteApi('/_app/shopping/');

/**
 * The shopping list (M3, OD-52; Q23): every line, To buy first, filtered by room, category,
 * phase and status. Filters live in the URL so a filtered list can be shared.
 */
export function Shopping() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const search = route.useSearch();
  const { canEdit, isAdmin } = useMe();
  const lines = useQuery(trpc.shoppingLines.list.queryOptions(shoppingFilter(search)));
  const rooms = useQuery(trpc.rooms.list.queryOptions());
  const categories = useQuery(trpc.categories.list.queryOptions());
  const phases = useQuery(trpc.phases.list.queryOptions());
  const jobs = useQuery(trpc.jobs.list.queryOptions());
  const invalidate = useInvalidateShopping();
  const [adding, setAdding] = useState(false);
  useReturnFocus(adding ? 'add-line' : null);
  const create = useMutation(
    trpc.shoppingLines.create.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setAdding(false);
      },
    }),
  );

  const setFilter = (key: keyof ShoppingSearch, value: string) =>
    void navigate({
      to: '/shopping',
      search: (prev: ShoppingSearch) => ({ ...prev, [key]: value === '' ? undefined : value }),
      replace: true,
    });
  const filtered = Object.keys(search).length > 0;
  const forJob = search.job ? jobs.data?.find((j) => j.id === search.job) : undefined;

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        title="Shopping"
        description="Everything to buy, To buy first. Planned phases' lines don't count against the money until the phase starts."
        action={
          canEdit && !adding ? (
            <Button type="button" onClick={() => setAdding(true)} data-return-focus="add-line">
              Add something
            </Button>
          ) : null
        }
      />

      {adding ? (
        <Panel aria-labelledby="new-line">
          <h2 id="new-line" className="text-2xl">
            Something to buy
          </h2>
          <div className="mt-4">
            <ShoppingLineForm
              idPrefix="new-line"
              defaults={{
                ...(search.room && search.room !== 'house' ? { roomId: search.room } : {}),
                ...(search.category ? { categoryId: search.category } : {}),
                ...(search.phase ? { phaseId: search.phase } : {}),
              }}
              submitLabel="Add to the list"
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

      <div role="group" aria-label="Show only" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FilterSelect
          id="filter-room"
          label="Room"
          value={search.room ?? ''}
          onChange={(v) => setFilter('room', v)}
          options={[
            ['', 'All rooms'],
            ['house', 'Whole house'],
            ...(rooms.data ?? []).map((r) => [r.id, r.name] as const),
          ]}
        />
        <FilterSelect
          id="filter-category"
          label="Category"
          value={search.category ?? ''}
          onChange={(v) => setFilter('category', v)}
          options={[
            ['', 'All categories'],
            ...(categories.data ?? []).map((c) => [c.id, c.name] as const),
          ]}
        />
        <FilterSelect
          id="filter-phase"
          label="Phase"
          value={search.phase ?? ''}
          onChange={(v) => setFilter('phase', v)}
          options={[['', 'All phases'], ...(phases.data ?? []).map((p) => [p.id, p.name] as const)]}
        />
        <FilterSelect
          id="filter-status"
          label="Status"
          value={search.status ?? ''}
          onChange={(v) => setFilter('status', v)}
          options={[
            ['', 'Any status'],
            ...(['to_buy', 'purchased', 'returned'] as const).map(
              (s) => [s, SHOPPING_STATUS_LABEL[s]] as const,
            ),
          ]}
        />
      </div>
      {forJob || filtered ? (
        <div className="-mt-4 flex flex-wrap items-center gap-3">
          {forJob ? <p className="text-muted-foreground">Bought for {forJob.name}.</p> : null}
          {filtered ? (
            <Button
              type="button"
              variant="ghost"
              className="px-0 sm:px-3"
              onClick={() => void navigate({ to: '/shopping', search: {}, replace: true })}
            >
              Show everything
            </Button>
          ) : null}
        </div>
      ) : null}

      {lines.isPending ? <p className="text-muted-foreground">Loading the list…</p> : null}
      {lines.error ? <p role="alert">Couldn&apos;t load the list: {lines.error.message}</p> : null}
      {lines.data && lines.data.length === 0 && !adding ? (
        <PlanGrid className="h-56 flex-col gap-3 rounded-xl text-base">
          <span>{filtered ? 'Nothing matches these filters.' : 'Nothing on the list yet.'}</span>
          {canEdit && !filtered ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdding(true)}
              data-return-focus="add-line"
            >
              Add the first thing
            </Button>
          ) : null}
        </PlanGrid>
      ) : null}
      {lines.data && lines.data.length > 0 ? (
        <Panel aria-label="Shopping list">
          <ShoppingList lines={lines.data} canEdit={canEdit} showRoom={search.room === undefined} />
        </Panel>
      ) : null}

      {isAdmin ? <CategoriesAdmin /> : null}
    </section>
  );
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <Select id={id} className="mt-1.5" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </Select>
    </div>
  );
}
