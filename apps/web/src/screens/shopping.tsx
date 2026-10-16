import type { RouterOutputs } from '@reparo/api';
import type { ShoppingStatusInput } from '@reparo/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { ListFilter, Plus, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Select, inputClass } from '@/components/form';
import { EditPanel } from '@/components/edit-panel';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { PlanGrid } from '@/components/plan-grid';
import { Reveal } from '@/components/reveal';
import { BoughtTape } from '@/components/bought-tape';
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
import { useRefreshShopping } from '@/lib/refresh';
import { ShoppingLineForm } from './shopping-line-form';
import { ShoppingLinePanel } from './shopping-line-panel';
import { BatchBar } from './shopping-batch';
import { ShoppingRows, type RowSelection } from './shopping-list';
import { useLineFiles } from '@/lib/use-line-files';
import { Loading, PanelShape } from '@/components/placeholder';
import { LoadError } from '@/components/load-error';

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
  const invalidate = useRefreshShopping();
  const [adding, setAdding] = useState(false);
  useReturnFocus(adding ? 'add-line' : null);
  // Batch editing (OD-101): Select turns on checkboxes; the picked lines stay picked through
  // search and filter changes, kept with the line as it was when picked (for Undo).
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlyMap<string, ShoppingLine>>(new Map());
  const selection: RowSelection | undefined = selecting
    ? {
        selected,
        toggle: (line) =>
          setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(line.id)) next.delete(line.id);
            else next.set(line.id, line);
            return next;
          }),
      }
    : undefined;
  const stopSelecting = () => {
    setSelected(new Map());
    setSelecting(false);
  };
  // Escape leaves Select mode, like Done (OD-104, Q103), unless something on top of the list
  // (a side panel) is what Escape should close.
  const panelOpen = openId !== null || adding;
  useEffect(() => {
    if (!selecting || panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      setSelected(new Map());
      setSelecting(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selecting, panelOpen]);
  const pickAll = (ls: ShoppingLine[], on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const l of ls) {
        if (on) next.set(l.id, l);
        else next.delete(l.id);
      }
      return next;
    });
  // Each picked line as it is now when it's on screen, so actions use current values.
  const current = new Map((lines.data ?? []).map((l) => [l.id, l]));
  const picked = new Map([...selected].map(([id, l]) => [id, current.get(id) ?? l]));
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
    <section className={cn('flex flex-col gap-6', picked.size > 0 && 'pb-56 md:pb-40')}>
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

      {totals.data ? <ShoppingTape sections={totals.data} /> : null}

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

      <Filters
        search={search}
        select={
          canEdit ? (
            // The label says the state (Select, then Done), so it isn't also an on/off button.
            <Button
              type="button"
              variant="outline"
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            >
              {selecting ? 'Done' : 'Select'}
            </Button>
          ) : null
        }
      />

      {lines.isPending || totals.isPending ? (
        <Loading label="Loading the list">
          <div className="flex flex-col gap-4">
            <PanelShape lines={5} />
            <PanelShape lines={5} />
          </div>
        </Loading>
      ) : null}
      {lines.error || totals.error ? (
        // A way back that isn't reloading the page (OD-106, Q109).
        <LoadError what="the list" error={lines.error ?? totals.error} retry={[lines, totals]} />
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
                alone={totals.data.filter((s) => s.count > 0).length === 1}
                lines={lines.data.filter((l) => l.status === section.status)}
                files={files.data ?? []}
                canEdit={canEdit}
                onOpen={(l) => setOpenId(l.id)}
                selection={selection}
                onPickAll={pickAll}
              />
            ),
          )
        : null}

      {picked.size > 0 ? (
        <BatchBar
          selected={picked}
          shownIds={new Set(current.keys())}
          onClear={() => setSelected(new Map())}
        />
      ) : null}

      <ShoppingLinePanel
        line={openLine}
        files={files.data ?? []}
        canEdit={canEdit}
        onClose={() => setOpenId(null)}
      />
    </section>
  );
}

/** Bought against left to buy for the list as filtered (OD-107, Q104), from the totals. */
function ShoppingTape({ sections }: { sections: Section[] }) {
  const cents = (status: Section['status']) =>
    sections.find((s) => s.status === status)?.totalCents ?? 0;
  return (
    <BoughtTape
      boughtCents={cents('purchased') + cents('returned')}
      leftCents={cents('to_buy')}
      className="-mt-2"
    />
  );
}

/**
 * One status's lines under room headings. To buy is always open; Purchased and Returned start
 * folded, since they're looked up rather than worked through.
 */
function ShoppingSection({
  section,
  alone,
  lines,
  files,
  canEdit,
  onOpen,
  selection,
  onPickAll,
}: {
  section: Section;
  /** The only section with anything in it. */
  alone: boolean;
  lines: ShoppingLine[];
  files: FileView[];
  canEdit: boolean;
  onOpen: (line: ShoppingLine) => void;
  selection: RowSelection | undefined;
  onPickAll: (lines: ShoppingLine[], on: boolean) => void;
}) {
  const foldable = section.status !== 'to_buy';
  const [open, setOpen] = useState(!foldable);
  // Rooms fold one at a time or all together, so a long list can be skimmed (OD-105, Q98).
  // They start open and the choice isn't kept.
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const roomKeys = section.rooms.map((r) => r.roomId ?? 'house');
  const anyOpen = roomKeys.some((k) => !folded.has(k));
  const fold = (key: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const bodyId = useId();
  const headingId = `section-${section.status}`;
  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id={headingId} className="text-2xl">
            {SECTION_TITLE[section.status]}
          </h2>
          {/* With only To buy showing, the page's opening sentence already says this (Q106). */}
          {alone && section.status === 'to_buy' ? null : (
            <span className="text-muted-foreground tabular-nums">
              {groupText(section.status, section.count, section.totalCents, money)}
            </span>
          )}
        </div>
        {foldable ? (
          <Button
            type="button"
            variant="ghost"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((v) => !v)}
          >
            {/* Fold, like the rooms (OD-108, Q113). */}
            {open ? 'Fold' : 'Unfold'}
            <span className="sr-only"> {SECTION_TITLE[section.status].toLowerCase()}</span>
          </Button>
        ) : roomKeys.length > 1 ? (
          <Button
            type="button"
            variant="ghost"
            className="-mr-3"
            onClick={() => setFolded(anyOpen ? new Set(roomKeys) : new Set())}
          >
            {anyOpen ? 'Fold all' : 'Unfold all'}
            <span className="sr-only"> rooms</span>
          </Button>
        ) : null}
      </div>
      <Reveal open={open} id={bodyId} className="mt-3 flex flex-col gap-4">
        {section.rooms.map((room) => {
          const inRoom = lines.filter((l) => (l.room?.id ?? null) === room.roomId);
          const key = room.roomId ?? 'house';
          const roomOpen = !folded.has(key);
          const roomBodyId = `${headingId}-${key}-rows`;
          return (
            <Panel
              key={key}
              aria-labelledby={`${headingId}-${key}`}
              className="overflow-hidden p-0 sm:p-0"
            >
              {/* The room's strip on the band tone, so it stands apart from its rows (OD-99). */}
              <div
                className={cn(
                  'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-band px-4 py-3 sm:px-5',
                  roomOpen && 'border-b border-border',
                )}
              >
                <div className="flex items-center gap-3">
                  {selection ? (
                    <SelectAll
                      lines={inRoom}
                      selected={selection.selected}
                      roomName={room.name}
                      onPick={(on) => onPickAll(inRoom, on)}
                    />
                  ) : null}
                  <h3 id={`${headingId}-${key}`} className="text-xl">
                    {room.name}
                  </h3>
                </div>
                <div className="flex items-center gap-x-2">
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {groupText(section.status, room.count, room.totalCents, money)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    // Inside the strip's padding, so the strip doesn't grow to fit it.
                    className="-my-2 -mr-3"
                    aria-expanded={roomOpen}
                    aria-controls={roomBodyId}
                    onClick={() => fold(key)}
                  >
                    {roomOpen ? 'Fold' : 'Unfold'}
                    <span className="sr-only"> {room.name}</span>
                  </Button>
                </div>
              </div>
              <Reveal open={roomOpen} id={roomBodyId}>
                <ShoppingRows
                  lines={inRoom}
                  files={files}
                  canEdit={canEdit}
                  onOpen={onOpen}
                  selection={selection}
                  className="px-4 sm:px-5"
                />
              </Reveal>
            </Panel>
          );
        })}
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
        placeholder="Search the list"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={cn(inputClass, 'pr-20 pl-10 [&::-webkit-search-cancel-button]:hidden')}
      />
      {text !== '' ? (
        // Stretched to the box's height rather than centred with a transform: the button's
        // 1px press shift replaces a transform, which dropped it out from under the pointer
        // mid-click so the click never landed (OD-102).
        <Button
          type="button"
          variant="ghost"
          className="absolute inset-y-0 right-0 px-3"
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
function Filters({ search, select }: { search: ShoppingSearch; select: ReactNode }) {
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
  };
  const chipLabel: Record<FilterKey, string> = {
    ...FILTER_LABEL,
    job: 'For',
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
          {select}
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
              // A filter that's on: small, in the other theme, with a 44px tap area (OD-126, Q173).
              className="ink relative inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-popover px-2.5 text-sm text-popover-foreground transition-colors duration-150 after:absolute after:inset-x-0 after:-inset-y-1.5 hover:bg-accent"
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

/**
 * "Select all" for one room while batch editing (OD-101, Q91): ticked when every line in the
 * room is picked, part-ticked when some are.
 */
function SelectAll({
  lines,
  selected,
  roomName,
  onPick,
}: {
  lines: ShoppingLine[];
  selected: ReadonlyMap<string, ShoppingLine>;
  roomName: string;
  onPick: (on: boolean) => void;
}) {
  const count = lines.filter((l) => selected.has(l.id)).length;
  const all = lines.length > 0 && count === lines.length;
  return (
    <label className="-my-2 -ml-2 flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={all}
        ref={(el) => {
          if (el) el.indeterminate = count > 0 && !all;
        }}
        onChange={() => onPick(!all)}
        className="size-5 accent-primary"
      />
      <span className="sr-only">Select all in {roomName}</span>
    </label>
  );
}
