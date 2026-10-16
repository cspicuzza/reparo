import type { RouterOutputs } from '@reparo/api';
import type { ShoppingStatusInput } from '@reparo/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { ListFilter, Plus, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Select, inputClass } from '@/components/form';
import { EditPanel } from '@/components/edit-panel';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { PlanGrid } from '@/components/plan-grid';
import { Reveal } from '@/components/reveal';
import { Button } from '@/components/ui/button';
import { useReturnFocus } from '@/lib/editor-focus';
import { useMe } from '@/lib/me';
import { money } from '@/lib/money';
import {
  groupText,
  shoppingFilter,
  summaryText,
  type ShoppingLine,
  type ShoppingSearch,
} from '@/lib/shopping';
import { useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { NOT_A_LOGIN } from '@/lib/fields';
import type { FileView } from '@/lib/upload';
import { useInvalidateShopping } from '@/lib/use-invalidate-shopping';
import { ShoppingLineForm } from './shopping-line-form';
import { ShoppingLinePanel } from './shopping-line-panel';
import { ShoppingRows } from './shopping-list';
import { useLineFiles } from '@/lib/use-line-files';
import { Loading, PanelShape } from '@/components/placeholder';

const route = getRouteApi('/_app/shopping/');

type Section = RouterOutputs['shoppingLines']['totals'][number];

const SECTION_TITLE: Record<ShoppingStatusInput, string> = {
  to_buy: 'To buy',
  purchased: 'Purchased',
  returned: 'Returned',
};

/**
 * The shopping list (M3, OD-52; reshaped in Workflow polish, OD-75). Built first for "what's
 * left to buy, and where it goes": a sentence saying what's left, then To buy grouped by room
 * with counts and totals, then Purchased and Returned folded away. Filters sit behind one
 * button and show as chips while in use; they live in the URL so a filtered list can be shared.
 * Every count and total comes from `shoppingLines.totals`.
 */
export function Shopping() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const search = route.useSearch();
  const { canEdit } = useMe();
  const filter = shoppingFilter(search);
  // While a search or filter changes, the last list stays up until the new one arrives, so
  // typing doesn't flash the placeholder (OD-98).
  const lines = useQuery({
    ...trpc.shoppingLines.list.queryOptions(filter),
    placeholderData: keepPreviousData,
  });
  const totals = useQuery({
    ...trpc.shoppingLines.totals.queryOptions(filter),
    placeholderData: keepPreviousData,
  });
  // Every line's pictures and receipts in one request (M4, OD-59), shared by the room groups.
  const files = useLineFiles(lines.data);
  const [openId, setOpenId] = useState<string | null>(null);
  useReturnFocus(openId);
  const openLine = lines.data?.find((l) => l.id === openId);
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

  const filtered = Object.keys(search).length > 0;
  const toBuy = totals.data?.find((s) => s.status === 'to_buy');

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Shopping"
        description={
          toBuy ? (
            <span className="text-xl text-foreground tabular-nums">
              {summaryText(toBuy.count, toBuy.totalCents, money, search.q)}
            </span>
          ) : (
            'What we still need to buy, room by room.'
          )
        }
        action={
          canEdit ? (
            <Button type="button" onClick={() => setAdding(true)} data-return-focus="add-line">
              <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
              Add something
            </Button>
          ) : null
        }
      />

      <EditPanel
        open={adding}
        title="Something to buy"
        onClose={() => {
          create.reset();
          setAdding(false);
        }}
      >
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
      </EditPanel>

      <Filters search={search} />

      {lines.isPending || totals.isPending ? (
        <Loading label="Loading the list">
          <div className="flex flex-col gap-4">
            <PanelShape lines={5} />
            <PanelShape lines={5} />
          </div>
        </Loading>
      ) : null}
      {lines.error || totals.error ? (
        <p role="alert">Couldn&apos;t load the list: {(lines.error ?? totals.error)?.message}</p>
      ) : null}
      {lines.data && lines.data.length === 0 ? (
        <PlanGrid className="h-56 flex-col gap-3 rounded-xl text-base">
          <span>
            {search.q
              ? `Nothing matches “${search.q}”.`
              : filtered
                ? 'Nothing matches these filters.'
                : 'Nothing on the list yet.'}
          </span>
          {filtered ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void navigate({ to: '/shopping', search: {}, replace: true })}
            >
              Show everything
            </Button>
          ) : canEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdding(true)}
              data-return-focus="add-line"
            >
              <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
              Add the first thing
            </Button>
          ) : null}
        </PlanGrid>
      ) : null}
      {lines.data && lines.data.length > 0 && totals.data
        ? totals.data.map((section) =>
            section.count === 0 ? null : (
              <ShoppingSection
                key={section.status}
                section={section}
                lines={lines.data.filter((l) => l.status === section.status)}
                files={files.data ?? []}
                canEdit={canEdit}
                onOpen={(l) => setOpenId(l.id)}
              />
            ),
          )
        : null}

      <ShoppingLinePanel
        line={openLine}
        files={files.data ?? []}
        canEdit={canEdit}
        onClose={() => setOpenId(null)}
      />
    </section>
  );
}

/**
 * One status's lines under room headings. To buy is always open; Purchased and Returned start
 * folded, since they're looked up rather than worked through.
 */
function ShoppingSection({
  section,
  lines,
  files,
  canEdit,
  onOpen,
}: {
  section: Section;
  lines: ShoppingLine[];
  files: FileView[];
  canEdit: boolean;
  onOpen: (line: ShoppingLine) => void;
}) {
  const foldable = section.status !== 'to_buy';
  const [open, setOpen] = useState(!foldable);
  const bodyId = useId();
  const headingId = `section-${section.status}`;
  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id={headingId} className="text-2xl">
            {SECTION_TITLE[section.status]}
          </h2>
          <span className="text-muted-foreground tabular-nums">
            {groupText(section.status, section.count, section.totalCents, money)}
          </span>
        </div>
        {foldable ? (
          <Button
            type="button"
            variant="ghost"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide' : 'Show'}
            <span className="sr-only"> {SECTION_TITLE[section.status].toLowerCase()}</span>
          </Button>
        ) : null}
      </div>
      <Reveal open={open} id={bodyId} className="mt-3 flex flex-col gap-4">
        {section.rooms.map((room) => (
          <Panel
            key={room.roomId ?? 'house'}
            aria-labelledby={`${headingId}-${room.roomId ?? 'house'}`}
            className="overflow-hidden p-0 sm:p-0"
          >
            {/* The room's strip on the band tone, so it stands apart from its rows (OD-99). */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border bg-band px-4 py-3 sm:px-5">
              <h3 id={`${headingId}-${room.roomId ?? 'house'}`} className="text-xl">
                {room.name}
              </h3>
              <span className="text-sm text-muted-foreground tabular-nums">
                {groupText(section.status, room.count, room.totalCents, money)}
              </span>
            </div>
            <ShoppingRows
              lines={lines.filter((l) => (l.room?.id ?? null) === room.roomId)}
              files={files}
              canEdit={canEdit}
              onOpen={onOpen}
              className="px-4 sm:px-5"
            />
          </Panel>
        ))}
      </Reveal>
    </section>
  );
}

const FILTER_LABEL = { room: 'Room', category: 'Category', store: 'Store', phase: 'Phase' };

/** The filters that show as chips; search has its own box. */
type FilterKey = Exclude<keyof ShoppingSearch, 'q'>;

/**
 * Search the list (OD-98, Q83–Q85): name, store, model number and notes, any case. It narrows
 * the list a moment after typing stops, and the text lives in the URL with the filters, so a
 * searched list can be shared. Clear empties it.
 */
function SearchBox({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (q: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  // Follow the URL when it changes from outside (Show everything, Back), the way the React docs
  // adjust state from a prop: https://react.dev/learn/you-might-not-need-an-effect
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  // The parent's handler changes every render; keep the latest without restarting the wait.
  const send = useRef(onChange);
  useEffect(() => {
    send.current = onChange;
  });
  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => send.current(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text, value]);
  return (
    <div role="search" className={cn('relative', className)}>
      <label htmlFor="shopping-search" className="sr-only">
        Search the list
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        {...NOT_A_LOGIN}
        id="shopping-search"
        type="search"
        autoComplete="off"
        placeholder="Search names, stores, model numbers, notes"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={cn(inputClass, 'pr-20 pl-10 [&::-webkit-search-cancel-button]:hidden')}
      />
      {text !== '' ? (
        <Button
          type="button"
          variant="ghost"
          className="absolute top-1/2 right-0 -translate-y-1/2 px-3"
          onClick={() => {
            setText('');
            onChange('');
          }}
        >
          Clear<span className="sr-only"> the search</span>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One "Filter" button that opens the choices, and the filters in use as chips you can remove
 * (OD-75, Q25). The Status filter is gone: the sections do that job.
 */
function Filters({ search }: { search: ShoppingSearch }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rooms = useQuery(trpc.rooms.list.queryOptions());
  const categories = useQuery(trpc.categories.list.queryOptions());
  const phases = useQuery(trpc.phases.list.queryOptions());
  const stores = useQuery(trpc.shoppingLines.stores.queryOptions());
  const jobs = useQuery(trpc.jobs.list.queryOptions());

  const setFilter = (key: keyof ShoppingSearch, value: string) =>
    void navigate({
      to: '/shopping',
      search: (prev: ShoppingSearch) => ({ ...prev, [key]: value === '' ? undefined : value }),
      replace: true,
    });

  const nameOf: Record<FilterKey, (v: string) => string | undefined> = {
    room: (v) => (v === 'house' ? 'Whole house' : rooms.data?.find((r) => r.id === v)?.name),
    category: (v) => categories.data?.find((c) => c.id === v)?.name,
    phase: (v) => phases.data?.find((p) => p.id === v)?.name,
    store: (v) => v,
    job: (v) => jobs.data?.find((j) => j.id === v)?.name,
    status: (v) => SECTION_TITLE[v as ShoppingStatusInput],
  };
  const chipLabel: Record<FilterKey, string> = {
    ...FILTER_LABEL,
    job: 'For',
    status: 'Status',
  };
  // Search has its own box, so it isn't a chip or counted as a filter.
  const active = (Object.keys(search) as (keyof ShoppingSearch)[]).filter(
    (k): k is FilterKey => k !== 'q' && search[k] !== undefined,
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Search fills the row with Filter beside it; on a phone Filter drops below (Q85). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBox
          value={search.q ?? ''}
          onChange={(q) => setFilter('q', q)}
          className="sm:flex-1"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            <ListFilter aria-hidden absoluteStrokeWidth strokeWidth={2} />
            {open ? 'Hide filters' : active.length > 0 ? `Filter (${active.length})` : 'Filter'}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {active.map((key) => {
          const value = search[key] ?? '';
          const label = `${chipLabel[key]}: ${nameOf[key](value) ?? '…'}`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key, '')}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-input bg-card px-3 text-base hover:bg-accent"
            >
              {label}
              <X aria-hidden className="size-4" />
              <span className="sr-only">, remove this filter</span>
            </button>
          );
        })}
        {active.length > 1 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void navigate({ to: '/shopping', search: {}, replace: true })}
          >
            Show everything
          </Button>
        ) : null}
      </div>
      <Reveal open={open} id={panelId} role="group" aria-label="Show only">
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            id="filter-room"
            label={FILTER_LABEL.room}
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
            label={FILTER_LABEL.category}
            value={search.category ?? ''}
            onChange={(v) => setFilter('category', v)}
            options={[
              ['', 'All categories'],
              ...(categories.data ?? []).map((c) => [c.id, c.name] as const),
            ]}
          />
          <FilterSelect
            id="filter-store"
            label={FILTER_LABEL.store}
            value={search.store ?? ''}
            onChange={(v) => setFilter('store', v)}
            options={[
              ['', 'All stores'],
              ...(stores.data ?? []).map((st) => [st.name, st.name] as const),
            ]}
          />
          <FilterSelect
            id="filter-phase"
            label={FILTER_LABEL.phase}
            value={search.phase ?? ''}
            onChange={(v) => setFilter('phase', v)}
            options={[
              ['', 'All phases'],
              ...(phases.data ?? []).map((p) => [p.id, p.name] as const),
            ]}
          />
        </div>
      </Reveal>
    </div>
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
