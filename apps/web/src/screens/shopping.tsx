import type { RouterOutputs } from '@reparo/api';
import type { ShoppingStatusInput } from '@reparo/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { ListFilter, Plus, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Select, inputClass, labelClass } from '@/components/form';
import { EditPanel } from '@/components/edit-panel';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { PlanGrid } from '@/components/plan-grid';
import { Reveal } from '@/components/reveal';
import { BoughtTape } from '@/components/bought-tape';
import { Button } from '@/components/ui/button';
import { SegmentedSwitch } from '@/components/segmented-switch';
import { useReturnFocus } from '@/lib/editor-focus';
import { groupBy } from '@/lib/group';
import { useMe } from '@/lib/me';
import { money } from '@/lib/money';
import {
  activeFilters,
  groupText,
  shoppingFilter,
  storeKey,
  summaryText,
  withoutStore,
  type ShoppingLine,
  type ShoppingSearch,
} from '@/lib/shopping';
import { useIsPhone } from '@/lib/media';
import { useTRPC } from '@/lib/trpc';
import { cn, TEXT_LINK } from '@/lib/utils';
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
import { StableLabel } from '@/components/stable-label';

const route = getRouteApi('/_app/shopping/');

type Section = RouterOutputs['shoppingLines']['totals'][number];

const SECTION_TITLE: Record<ShoppingStatusInput, string> = {
  to_buy: 'To buy',
  purchased: 'Purchased',
  returned: 'Returned',
};

/**
 * The shopping list (M3, OD-52; reshaped in Workflow polish, OD-75, and for the phone and the
 * store, OD-137). Built for "what's left to buy, and where it goes": the bought/left tape, a
 * search bar that stays at the top while scrolling, one-tap store chips, then To buy grouped by
 * room or by store with counts and totals, then Purchased and Returned put away. Filters sit
 * behind one button and show as chips while in use; filters and grouping live in the URL so a
 * list can be shared. Every count and total comes from `shoppingLines.totals`.
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
  // The store chips count what's left to buy at each store under every other filter, so picking
  // one store doesn't hide the rest (OD-137). The same query as `totals` when no store is picked.
  const storeTotals = useQuery({
    ...trpc.shoppingLines.totals.queryOptions(shoppingFilter(withoutStore(search))),
    placeholderData: keepPreviousData,
  });
  // "/" jumps to the search box on a laptop, unless you're typing somewhere (OD-137). The box
  // is always on screen, so the shortcut is only ever a quicker way to it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && t.closest('input, textarea, select, [contenteditable]'))
        return;
      const box = document.getElementById('shopping-search');
      if (!box) return;
      e.preventDefault();
      box.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  // Every line's pictures and receipts in one request (M4, OD-59), shared by the room groups.
  const files = useLineFiles(lines.data);
  // The open item lives in the address (`?line=`), so a link can open it (OD-145).
  const openId = search.line ?? null;
  const setOpenId = (lineId: string | null) =>
    void navigate({
      to: '/shopping',
      search: (prev: ShoppingSearch) => {
        const next = { ...prev };
        if (lineId) next.line = lineId;
        else delete next.line;
        return next;
      },
      replace: lineId === null,
    });
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
  // Whatever ends Select mode or empties the selection (Done, Escape, Clear, a batch action)
  // takes away the control that had focus, so focus goes back to Select (OD-136).
  const selectButton = useRef<HTMLButtonElement>(null);
  const focusSelect = () => requestAnimationFrame(() => selectButton.current?.focus());
  const stopSelecting = () => {
    setSelected(new Map());
    setSelecting(false);
    focusSelect();
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
      requestAnimationFrame(() => selectButton.current?.focus());
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

  const setGroup = (g: Grouping) =>
    void navigate({
      to: '/shopping',
      search: (prev: ShoppingSearch) => {
        const next = { ...prev };
        if (g === 'store') next.group = 'store';
        else delete next.group;
        return next;
      },
      replace: true,
    });
  const filtered = activeFilters(search).length > 0 || search.q !== undefined;
  const toBuy = totals.data?.find((s) => s.status === 'to_buy');
  const stores = storeTotals.data?.find((s) => s.status === 'to_buy')?.stores ?? [];
  // A search or a store narrows the list to what you're after, so its groups start open.
  const narrowed = search.q !== undefined || search.store !== undefined;

  return (
    <section className={cn('flex flex-col gap-6', picked.size > 0 && 'pb-56 md:pb-40')}>
      {/* Read out as the search changes: a live region that's always there, so the first
          result is announced too (OD-145). */}
      <p role="status" className="sr-only">
        {toBuy && search.q !== undefined
          ? summaryText(toBuy.count, toBuy.totalCents, money, search.q)
          : ''}
      </p>
      <PageHeader
        title="Shopping"
        // Aligned to the top, so Add something doesn't jump down when a search adds a line
        // under the title (OD-145).
        className="items-start"
        // The count and total live in the To buy heading (OD-137); a search says what it found.
        description={
          toBuy && search.q !== undefined ? (
            <span className="text-foreground tabular-nums">
              {summaryText(toBuy.count, toBuy.totalCents, money, search.q)}
            </span>
          ) : undefined
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
        stores={stores}
        onGroup={setGroup}
        select={
          canEdit ? (
            // The label says the state (Select, then Done), so it isn't also an on/off button.
            <Button
              ref={selectButton}
              type="button"
              variant="outline"
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            >
              <StableLabel on={selecting} onLabel="Done" offLabel="Select" />
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
      {lines.data && lines.data.length > 0 ? (
        // On a phone the switch lives in the Filter panel, so the list starts higher (OD-144).
        <GroupSwitch
          name="shopping-group"
          value={search.group ?? 'room'}
          onChange={setGroup}
          className="hidden sm:flex"
        />
      ) : null}
      {lines.data && lines.data.length > 0 && totals.data
        ? totals.data.map((section) =>
            section.count === 0 ? null : (
              <ShoppingSection
                key={`${section.status}-${search.group ?? 'room'}`}
                section={section}
                group={search.group ?? 'room'}
                startOpen={narrowed}
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
          onClear={() => {
            setSelected(new Map());
            focusSelect();
          }}
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
      // On a phone the To buy heading says the same in one line (OD-144).
      className="-mt-2 hidden sm:block"
    />
  );
}

/** How the list is grouped: by room (where things go) or by store (where you buy them). */
type Grouping = 'room' | 'store';

/**
 * Room or store (OD-137): a two-way switch like Money in or out. Grouping by store is for
 * walking a store's aisles; it lives in the URL like the filters.
 */
function GroupSwitch({
  name,
  value,
  onChange,
  className,
  stacked = false,
}: {
  name: string;
  value: Grouping;
  onChange: (g: Grouping) => void;
  className?: string;
  /** Its label above it, like the filters beside it in the Filter panel (OD-145). */
  stacked?: boolean;
}) {
  const options = [
    ['room', 'By room'],
    ['store', 'By store'],
  ] as const;
  return (
    <fieldset
      className={cn(stacked ? 'flex flex-col gap-1.5' : 'flex items-center gap-3', className)}
    >
      <legend className="sr-only">Group the list</legend>
      <span aria-hidden className={labelClass}>
        Group
      </span>
      <SegmentedSwitch
        name={name}
        value={value}
        options={options.map(([v, text]) => ({ value: v, label: text }))}
        onChange={onChange}
        className={stacked ? 'w-full' : 'max-w-xs min-w-0 flex-1 sm:w-72 sm:flex-none'}
      />
    </fieldset>
  );
}

/**
 * Which groups are open, by group key, for one section and grouping. Only groups someone opened
 * or put away are stored; the rest follow the default. Kept for the tab in sessionStorage, so
 * coming back to Shopping finds the list as it was left (OD-137); storage can be unavailable,
 * and then it simply isn't kept.
 */
function useGroupsShown(storageKey: string) {
  const key = `reparo:shopping-shown:${storageKey}`;
  const [shown, setShown] = useState<Record<string, boolean>>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === 'object') {
        return Object.fromEntries(
          Object.entries(parsed).filter((e): e is [string, boolean] => typeof e[1] === 'boolean'),
        );
      }
    } catch {
      // Not kept this time.
    }
    return {};
  });
  const update = (next: Record<string, boolean>) => {
    setShown(next);
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Not kept this time.
    }
  };
  return [shown, update] as const;
}

/**
 * One status's lines under room or store headings. To buy is always shown; Purchased and
 * Returned start put away, since they're looked up rather than worked through. Each group's
 * strip shows or hides it with one tap anywhere on it; on a phone the groups start hidden, so
 * the list starts as a short index of rooms or stores (OD-137), unless a search or store narrows
 * it or there's only one group.
 */
function ShoppingSection({
  section,
  group,
  startOpen,
  lines,
  files,
  canEdit,
  onOpen,
  selection,
  onPickAll,
}: {
  section: Section;
  group: Grouping;
  /** A search or store filter is on: every group starts shown. */
  startOpen: boolean;
  lines: ShoppingLine[];
  files: FileView[];
  canEdit: boolean;
  onOpen: (line: ShoppingLine) => void;
  selection: RowSelection | undefined;
  onPickAll: (lines: ShoppingLine[], on: boolean) => void;
}) {
  const phone = useIsPhone();
  const foldable = section.status !== 'to_buy';
  const [open, setOpen] = useState(!foldable);
  // Each group looks its lines up instead of filtering the whole list (OD-157).
  const linesByStore = groupBy(lines, storeKey);
  const linesByRoom = groupBy(lines, (l) => l.room?.id ?? null);
  const groups =
    group === 'store'
      ? section.stores.map((st) => ({
          key: `store-${st.key || 'none'}`,
          name: st.name,
          count: st.count,
          totalCents: st.totalCents,
          unpriced: st.unpriced,
          lines: linesByStore.get(st.key) ?? [],
        }))
      : section.rooms.map((r) => ({
          key: r.roomId ?? 'house',
          name: r.name,
          count: r.count,
          totalCents: r.totalCents,
          unpriced: r.unpriced,
          lines: linesByRoom.get(r.roomId) ?? [],
        }));
  const [shown, setShown] = useGroupsShown(`${section.status}:${group}`);
  const byDefault = !phone || startOpen || groups.length === 1;
  const isShown = (k: string) => shown[k] ?? byDefault;
  const anyShown = groups.some((g) => isShown(g.key));
  const bodyId = useId();
  const headingId = `section-${section.status}`;
  const title = SECTION_TITLE[section.status];
  return (
    <section aria-labelledby={headingId}>
      {/* The heading and its count wrap among themselves; Show/Hide stays at the right edge
          instead of dropping to an indented line of its own on a phone (OD-145). */}
      <div className="flex items-baseline justify-between gap-x-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h2 id={headingId} className="text-2xl">
            {title}
          </h2>
          {/* How many and what they come to, said here and only here (OD-137). */}
          <span className="text-muted-foreground tabular-nums">
            {groupText(section.status, section.count, section.totalCents, money, section.unpriced)}
          </span>
        </div>
        {foldable ? (
          <Button
            type="button"
            variant="ghost"
            className="-mr-3"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide' : 'Show'}
            <span className="sr-only"> {title.toLowerCase()}</span>
          </Button>
        ) : groups.length > 1 ? (
          <Button
            type="button"
            variant="ghost"
            className="-mr-3"
            onClick={() =>
              setShown(Object.fromEntries(groups.map((g) => [g.key, !anyShown] as const)))
            }
          >
            {anyShown ? 'Hide all' : 'Show all'}
            <span className="sr-only"> {group === 'store' ? 'stores' : 'rooms'}</span>
          </Button>
        ) : null}
      </div>
      <Reveal open={open} id={bodyId} className="mt-3 flex flex-col gap-3 sm:gap-4">
        {groups.map((g) => {
          const groupShown = isShown(g.key);
          const groupBodyId = `${headingId}-${g.key}-rows`;
          return (
            <Panel
              key={g.key}
              aria-labelledby={`${headingId}-${g.key}`}
              className="overflow-hidden p-0 sm:p-0"
            >
              {/* The group's strip on the band tone, so it stands apart from its rows (OD-99).
                  The whole strip is the button that shows or hides it (OD-137). */}
              <div
                className={cn(
                  'flex items-center gap-3 bg-band px-4 sm:px-5',
                  groupShown && 'border-b border-border',
                )}
              >
                {selection ? (
                  <SelectAll
                    lines={g.lines}
                    selected={selection.selected}
                    groupName={g.name}
                    onPick={(on) => onPickAll(g.lines, on)}
                  />
                ) : null}
                <h3 id={`${headingId}-${g.key}`} className="min-w-0 flex-1 text-xl">
                  <button
                    type="button"
                    aria-expanded={groupShown}
                    aria-controls={groupBodyId}
                    onClick={() => setShown({ ...shown, [g.key]: !groupShown })}
                    className="flex min-h-14 w-full flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-2 text-left"
                  >
                    <span className="min-w-0 break-words">{g.name}</span>
                    <span className="flex items-center gap-3 text-sm font-normal text-muted-foreground tabular-nums [font-stretch:normal]">
                      {groupText(section.status, g.count, g.totalCents, money, g.unpriced)}
                      <span aria-hidden className={TEXT_LINK}>
                        {groupShown ? 'Hide' : 'Show'}
                      </span>
                    </span>
                  </button>
                </h3>
              </div>
              <Reveal open={groupShown} id={groupBodyId}>
                <ShoppingRows
                  byStore={group === 'store'}
                  lines={g.lines}
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

/** The filters that show as chips; search has its own box and grouping its own switch. */
type FilterKey = Exclude<keyof ShoppingSearch, 'q' | 'group' | 'line'>;

type StoreGroup = Section['stores'][number];

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
        className={cn(
          inputClass,
          // Room for Clear only while there's something to clear.
          text !== '' ? 'pr-20' : 'pr-3',
          'pl-10 [&::-webkit-search-cancel-button]:hidden',
        )}
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
 * The bar at the top of the list (OD-137): search, Filter and Select on one line that stays at
 * the top of the screen while scrolling, so they're always a tap away. Under it, one chip per
 * store with what's left to buy there (one tap shows just that store), the other filters in use
 * as chips you can remove, and the Filter choices (OD-75, Q25).
 */
function Filters({
  search,
  stores,
  onGroup,
  select,
}: {
  search: ShoppingSearch;
  /** Room or store grouping; its switch sits in the Filter panel on a phone (OD-144). */
  onGroup: (g: Grouping) => void;
  /** What's left to buy at each store, under every filter but the store (OD-137). */
  stores: StoreGroup[];
  select: ReactNode;
}) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rooms = useQuery(trpc.rooms.list.queryOptions());
  const categories = useQuery(trpc.categories.list.queryOptions());
  const phases = useQuery(trpc.phases.list.queryOptions());
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
    unpriced: () => 'yes',
  };
  const chipLabel: Record<FilterKey, string> = {
    ...FILTER_LABEL,
    job: 'For',
    unpriced: 'No price yet',
  };
  // The store has its own chips; the rest show as removable chips.
  const named = stores.filter((st) => st.key !== '');
  const active = activeFilters(search).filter((k) => k !== 'store');
  const panelCount = active.length;

  return (
    // `contents`, so the bar's sticky box is the whole page section and it stays pinned all the
    // way down the list, not just past this block.
    <div className="contents">
      {/* Pinned under the top of the screen while the list scrolls (OD-137). Full-bleed, so
          rows don't show at its sides. */}
      <div className="sticky top-0 z-30 -mx-4 flex flex-col gap-2 border-b border-border bg-background px-4 py-2 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* At 320px the search takes the whole row, Filter and Select under it (OD-145). */}
          <SearchBox
            value={search.q ?? ''}
            onChange={(q) => setFilter('q', q)}
            className="min-w-0 flex-1 basis-full min-[22.5rem]:basis-0"
          />
          <Button
            type="button"
            variant="outline"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            // Open reads as pressed in, like a menu's trigger (OD-145).
            className="px-3 aria-expanded:bg-accent sm:px-4"
          >
            <ListFilter aria-hidden absoluteStrokeWidth strokeWidth={2} />
            {panelCount > 0 ? `Filter (${panelCount})` : 'Filter'}
          </Button>
          {select}
        </div>
        {/* The store chips stay pinned with the search: in a store they're the way in (OD-144). */}
        {named.length > 0 ? (
          <StoreChips
            stores={named}
            current={search.store}
            onPick={(store) => setFilter('store', store ?? '')}
          />
        ) : null}
      </div>
      <div className="-mt-3 flex flex-col gap-3 empty:hidden">
        <div className="flex flex-wrap items-center gap-2 empty:hidden">
          {active.map((key) => {
            const value = search[key] ?? '';
            const label =
              key === 'unpriced'
                ? chipLabel[key]
                : `${chipLabel[key]}: ${nameOf[key](String(value)) ?? '…'}`;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key, '')}
                // A filter that's on: small, in the other theme, with a 44px tap area (OD-126, Q173).
                className={cn(ON_CHIP, 'gap-1.5')}
              >
                {label}
                <X aria-hidden absoluteStrokeWidth strokeWidth={2} className="size-4" />
                <span className="sr-only">, remove this filter</span>
              </button>
            );
          })}
          {active.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                void navigate({
                  to: '/shopping',
                  search: (prev: ShoppingSearch) => {
                    // Keeps the search, the store and the grouping; only the filters go.
                    const next = { ...prev };
                    delete next.room;
                    delete next.category;
                    delete next.phase;
                    delete next.job;
                    delete next.unpriced;
                    return next;
                  },
                  replace: true,
                })
              }
            >
              Clear filters
            </Button>
          ) : null}
        </div>
        <Reveal open={open} id={panelId} role="group" aria-label="Show only">
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
            <GroupSwitch
              name="shopping-group-phone"
              value={search.group ?? 'room'}
              onChange={onGroup}
              className="sm:hidden"
              stacked
            />
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
    </div>
  );
}

/** A chip that's on: small, in the other theme, with a 44px tap area (OD-126, Q173). */
const ON_CHIP =
  'ink relative inline-flex min-h-8 shrink-0 items-center rounded-lg border border-transparent bg-popover px-2.5 text-sm text-popover-foreground transition-colors duration-150 after:absolute after:inset-x-0 after:-inset-y-1.5 hover:bg-accent';
/** A chip that's off: the same size, on the card with the control border. */
const OFF_CHIP =
  'relative inline-flex min-h-8 shrink-0 items-center rounded-lg border border-input bg-card px-2.5 text-sm text-foreground transition-colors duration-150 after:absolute after:inset-x-0 after:-inset-y-1.5 hover:bg-accent';

/**
 * One chip per store with how many things are left to buy there, most first (OD-137): one tap
 * shows only that store, tapping it again (or "All stores") shows them all. On a phone they
 * scroll sideways in one row, with room above and below for the tap area.
 */
function StoreChips({
  stores,
  current,
  onPick,
}: {
  stores: StoreGroup[];
  current: string | undefined;
  onPick: (store: string | undefined) => void;
}) {
  const phone = useIsPhone();
  const [more, setMore] = useState(false);
  const picked = current?.toLowerCase();
  // A store picked from an old link that has nothing left to buy still gets its chip.
  const all =
    current !== undefined && !stores.some((st) => st.key === picked)
      ? [{ key: picked ?? '', name: current, count: 0, totalCents: 0 }, ...stores]
      : stores;
  // On a laptop the busiest stores, and the picked one, until "More stores"; a phone scrolls
  // the whole row sideways instead.
  const limit = 9;
  const list = phone || more ? all : all.filter((st, i) => i < limit || st.key === picked);
  const hidden = all.length - list.length;
  return (
    <div
      role="group"
      aria-label="Show one store"
      className="-mx-4 -my-1.5 flex gap-2 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      <button
        type="button"
        aria-pressed={current === undefined}
        onClick={() => onPick(undefined)}
        className={current === undefined ? ON_CHIP : OFF_CHIP}
      >
        All stores
      </button>
      {list.map((st) => {
        const on = st.key === picked;
        return (
          <button
            key={st.key}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(on ? undefined : st.name)}
            className={cn(on ? ON_CHIP : OFF_CHIP, 'gap-1.5')}
          >
            {st.name}
            <span className={cn('tabular-nums', on ? 'opacity-80' : 'text-muted-foreground')}>
              {st.count}
              <span className="sr-only"> to buy</span>
            </span>
          </button>
        );
      })}
      {hidden > 0 || (more && !phone && all.length > limit) ? (
        <Button
          type="button"
          variant="link"
          className="relative min-h-8 px-0 text-sm after:absolute after:-inset-x-1 after:-inset-y-1.5"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          {more ? 'Fewer stores' : `${hidden} more ${hidden === 1 ? 'store' : 'stores'}`}
        </Button>
      ) : null}
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
      <label htmlFor={id} className={labelClass}>
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
 * "Select all" for one room or store while batch editing (OD-101, Q91): ticked when every line in the
 * room is picked, part-ticked when some are.
 */
function SelectAll({
  lines,
  selected,
  groupName,
  onPick,
}: {
  lines: ShoppingLine[];
  selected: ReadonlyMap<string, ShoppingLine>;
  groupName: string;
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
        className="size-5"
      />
      <span className="sr-only">Select all in {groupName}</span>
    </label>
  );
}
