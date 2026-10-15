import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * Loading placeholders (Workflow polish, OD-71): the shape of what's coming, on the inset
 * surface, so the page doesn't jump when the data arrives. No shimmer: nothing moves that the
 * person didn't ask to move (web.md → Motion). Screen readers hear the label once, from a
 * polite status region; the shapes themselves are hidden from them.
 */

const widths = ['w-3/5', 'w-2/5', 'w-1/2', 'w-1/3', 'w-2/3'];

/** One grey bar standing in for a line of text or a control. */
export function Bar({ className }: { className?: string | undefined }) {
  return <div className={cn('h-4 rounded-md bg-inset', className)} />;
}

/** The wrapper every placeholder uses: a status region that names what's loading. */
export function Loading({
  label,
  className,
  children,
}: {
  /** Read out, e.g. "Loading rooms". */
  label: string;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden>{children}</div>
    </div>
  );
}

/** Rows like a PanelList (or, with `surface={false}`, bare rows divided by lines). */
export function ListPlaceholder({
  label,
  rows = 4,
  surface = true,
  className,
}: {
  label: string;
  rows?: number;
  surface?: boolean;
  className?: string | undefined;
}) {
  return (
    <Loading label={label} className={className}>
      <div
        className={cn(
          'divide-y divide-border',
          surface && 'overflow-hidden rounded-xl border border-border bg-card',
        )}
      >
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className={cn(
              'flex items-center justify-between gap-4 py-4',
              surface && 'px-4 sm:px-5',
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Bar className={cn('h-6', widths[i % widths.length])} />
              <Bar className="w-1/4" />
            </div>
            <Bar className="h-6 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** A Panel: a heading and a few lines. */
export function PanelPlaceholder({
  label,
  lines = 3,
  className,
}: {
  label: string;
  lines?: number;
  className?: string | undefined;
}) {
  return (
    <Loading label={label} className={className}>
      <PanelShape lines={lines} />
    </Loading>
  );
}

/** A panel's outline without its own status region, for composing page placeholders. */
export function PanelShape({ lines }: { lines: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:p-6">
      <Bar className="mb-2 h-7 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Bar key={i} className={widths[(i + 2) % widths.length]} />
      ))}
    </div>
  );
}

/** Lines of text inside a section that already has its heading. */
export function LinesPlaceholder({
  label,
  lines = 2,
  className,
}: {
  label: string;
  lines?: number;
  className?: string | undefined;
}) {
  return (
    <Loading label={label} className={className}>
      <div className="flex flex-col gap-3">
        {Array.from({ length: lines }, (_, i) => (
          <Bar key={i} className={cn('h-6', widths[i % widths.length])} />
        ))}
      </div>
    </Loading>
  );
}

/** A grid of pictures, laid out like FileGrid. */
export function GridPlaceholder({
  label,
  count = 4,
  className,
}: {
  label: string;
  count?: number;
  className?: string | undefined;
}) {
  return (
    <Loading label={label} className={className}>
      <Bar className="mb-4 h-7 w-1/4" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="aspect-[4/3] rounded-lg bg-inset" />
        ))}
      </div>
    </Loading>
  );
}

/** A form: a label and a 44px control per field. */
export function FormPlaceholder({
  label,
  fields = 4,
  className,
}: {
  label: string;
  fields?: number;
  className?: string | undefined;
}) {
  return (
    <Loading label={label} className={className}>
      <div className="grid gap-5">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Bar className="w-24" />
            <div className="h-11 rounded-lg bg-inset" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** A whole page whose title is still coming: back link, title, then panels. */
export function PagePlaceholder({ label, panels = 2 }: { label: string; panels?: number }) {
  return (
    <Loading label={label}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <Bar className="w-24" />
          <Bar className="h-10 w-1/2" />
          <Bar className="w-1/4" />
        </div>
        {Array.from({ length: panels }, (_, i) => (
          <PanelShape key={i} lines={3} />
        ))}
      </div>
    </Loading>
  );
}
