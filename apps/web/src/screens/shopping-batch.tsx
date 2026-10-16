import { sumCents } from '@reparo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FormError, Select } from '@/components/form';
import { Button } from '@/components/ui/button';
import { listText, money } from '@/lib/money';
import type { ShoppingLine } from '@/lib/shopping';
import { useToasts } from '@/lib/toasts';
import { trpcClient, useTRPC } from '@/lib/trpc';
import { useRefreshShopping } from '@/lib/refresh';

type Change = { id: string; roomId?: string | null; categoryId?: string; jobId?: string | null };
type Field = 'roomId' | 'categoryId' | 'jobId';

const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;

/**
 * The batch editing bar (OD-101, Q91–Q96): pinned to the bottom while lines are picked, with
 * how many and the four actions. Each action saves every picked line in one transaction and
 * offers Undo for 10 seconds, which puts each line back the way it was. Remove asks first.
 * Picked lines that a search or filter hides still count, and the bar says so.
 */
export function BatchBar({
  selected,
  shownIds,
  onClear,
}: {
  selected: ReadonlyMap<string, ShoppingLine>;
  /** The lines on screen now, to say how many picked ones are hidden. */
  shownIds: ReadonlySet<string>;
  /** Clear the selection (after an action, or Done). */
  onClear: () => void;
}) {
  const trpc = useTRPC();
  const toasts = useToasts();
  const invalidate = useRefreshShopping();
  const rooms = useQuery(trpc.rooms.list.queryOptions());
  const categories = useQuery(trpc.categories.list.queryOptions());
  const jobs = useQuery(trpc.jobs.list.queryOptions());
  const [confirming, setConfirming] = useState(false);

  const lines = [...selected.values()];
  const hidden = lines.filter((l) => !shownIds.has(l.id)).length;
  const phaseIds = new Set(lines.map((l) => l.phaseId));
  const onePhase = phaseIds.size === 1 ? [...phaseIds][0] : undefined;
  const phaseJobs = (jobs.data ?? []).filter((j) => j.phaseId === onePhase);

  // Each line's value before a change, so Undo can put every one back.
  const before = (field: Field): Change[] => lines.map((l) => ({ id: l.id, [field]: l[field] }));

  const update = useMutation({
    mutationFn: async ({ changes }: { changes: Change[]; undo: Change[]; done: string }) => {
      await trpcClient.shoppingLines.updateMany.mutate({ changes });
      await invalidate();
    },
    onSuccess: (_r, { undo, done }) => {
      onClear();
      toasts.add({
        title: done,
        timeout: 10_000,
        actionProps: {
          children: 'Undo',
          onClick: () =>
            void trpcClient.shoppingLines.updateMany
              .mutate({ changes: undo })
              .then(invalidate)
              .catch(() => undefined),
        },
      });
    },
  });
  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      await trpcClient.shoppingLines.removeMany.mutate({ ids });
      await invalidate();
    },
    onSuccess: (_r, ids) => {
      setConfirming(false);
      onClear();
      toasts.add({
        title: `Removed ${items(ids.length)}`,
        timeout: 10_000,
        actionProps: {
          children: 'Undo',
          onClick: () =>
            void trpcClient.shoppingLines.restoreMany
              .mutate({ ids })
              .then(invalidate)
              .catch(() => undefined),
        },
      });
    },
  });

  const set = (field: Field, value: string | null, done: string) =>
    update.mutate({
      changes: lines.map((l) => ({ id: l.id, [field]: value })),
      undo: before(field),
      done,
    });
  const busy = update.isPending || remove.isPending;
  const error = update.error ?? remove.error;

  return (
    <div
      role="region"
      aria-label="Batch editing"
      // The same column as the page (shell.tsx: max-w-6xl with px-4, sm:px-6), so the bar lines
      // up with the list instead of overhanging it (OD-104, Q103).
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-6xl px-4 sm:px-6 md:bottom-4"
    >
      {/* The other theme, so the bar stands clear of the list it floats over (OD-126, Q175). */}
      <div className="ink flex flex-col gap-3 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-[0_6px_24px_var(--float-shadow)] sm:p-4">
        {/* Phone: the count and Clear on top, the actions two to a row below. Laptop: one row,
            count first and Clear last. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center justify-between gap-3 sm:contents">
            <p
              role="status"
              aria-live="polite"
              className="font-semibold tabular-nums sm:order-1 sm:whitespace-nowrap"
            >
              {/* How many and what they cost together (OD-104, Q103). */}
              {items(lines.length)}, {money(sumCents(lines.map((l) => l.priceCents)))} selected
              {hidden > 0 ? (
                <span className="font-normal text-muted-foreground"> ({hidden} not shown)</span>
              ) : null}
            </p>
            <Button
              type="button"
              variant="ghost"
              className="-mr-2 sm:order-3 sm:mr-0 sm:ml-auto"
              onClick={onClear}
            >
              Clear
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:order-2 sm:flex sm:flex-wrap sm:items-center">
            <BatchSelect
              label="Move to room…"
              disabled={busy}
              options={[
                { value: 'house', label: 'Whole house' },
                ...(rooms.data ?? []).map((r) => ({ value: r.id, label: r.name })),
              ]}
              onPick={(v, label) =>
                set('roomId', v === 'house' ? null : v, `Moved ${items(lines.length)} to ${label}`)
              }
            />
            <BatchSelect
              label="Set category…"
              disabled={busy}
              options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
              onPick={(v, label) =>
                set('categoryId', v, `Put ${items(lines.length)} under ${label}`)
              }
            />
            <BatchSelect
              label="Set job…"
              disabled={busy || onePhase === undefined}
              note={onePhase === undefined ? 'Pick items from one phase to set a job' : undefined}
              options={[
                { value: 'none', label: 'No job' },
                ...phaseJobs.map((j) => ({ value: j.id, label: j.name })),
              ]}
              onPick={(v, label) =>
                set(
                  'jobId',
                  v === 'none' ? null : v,
                  v === 'none'
                    ? `${items(lines.length)} no longer for a job`
                    : `${items(lines.length)} now for ${label}`,
                )
              }
            />
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              Remove
            </Button>
          </div>
        </div>
        {onePhase === undefined ? (
          <p className="text-sm text-muted-foreground">
            The picked items are in different phases. Pick items from one phase to set a job.
          </p>
        ) : null}
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="min-w-0">
              Remove {items(lines.length)}
              {lines.length <= 3 ? ` (${listText(lines.map((l) => l.name))})` : ''}?
            </span>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate(lines.map((l) => l.id))}
            >
              Yes, remove
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        ) : null}
        {error ? <FormError>{error.message}</FormError> : null}
      </div>
    </div>
  );
}

/**
 * One batch action as a dropdown: it reads as its action ("Move to room") and applies the
 * moment something is picked, then goes back to reading as the action.
 */
function BatchSelect({
  label,
  options,
  disabled,
  note,
  onPick,
}: {
  label: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  note?: string | undefined;
  onPick: (value: string, label: string) => void;
}) {
  return (
    <Select
      aria-label={note ? `${label}: ${note}` : label}
      value=""
      disabled={disabled}
      className="min-w-0 sm:w-44"
      onChange={(e) => {
        const picked = options.find((o) => o.value === e.target.value);
        if (picked) onPick(picked.value, picked.label);
      }}
    >
      <option value="" disabled>
        {label}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
