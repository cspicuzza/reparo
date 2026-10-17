import { formatLength, type Inches } from '@reparo/shared';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A room's size as a small floor plan (OD-128, Q180): the room drawn to its own proportions,
 * the length on a dimension line along the top, the width on one down the side, the floor area
 * written inside, and the ceiling as a short vertical dimension beside it (below it on a phone).
 * Each measurement is a slot, so editors get fields there and everyone else gets the numbers.
 */
export function FloorPlan({
  lengthIn,
  widthIn,
  length,
  width,
  ceiling,
  area,
  fields = false,
}: {
  lengthIn: Inches | null | undefined;
  widthIn: Inches | null | undefined;
  length: ReactNode;
  width: ReactNode;
  ceiling: ReactNode;
  /** Written inside the room. */
  area: ReactNode;
  /** The slots hold fields (label, then a 44px input), so the top line meets the input's middle. */
  fields?: boolean;
}) {
  const measured = lengthIn != null && widthIn != null && lengthIn > 0 && widthIn > 0;
  // Proportions only (no units involved); kept within 3:1 either way so a corridor stays legible.
  const ratio = measured ? Math.min(3, Math.max(1 / 3, lengthIn / widthIn)) : 4 / 3;
  // The drawing fits a 22rem × 14rem box: wide rooms fill its width, deep ones its height.
  const widthRem = ratio >= 22 / 14 ? 22 : Math.max(7, 14 * ratio);
  // From the slot's bottom to the middle of what it shows: a 44px input, or a 28px number.
  const style = {
    '--plan-w': `${widthRem}rem`,
    '--dim-mid': fields ? '22px' : '14px',
  } as CSSProperties;
  return (
    <div
      style={style}
      className="grid grid-cols-[auto_minmax(0,var(--plan-w))] justify-start gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,var(--plan-w))_auto] sm:gap-x-5"
    >
      <div className="col-start-2 row-start-1">
        <HorizontalDimension>{length}</HorizontalDimension>
      </div>
      <div className="col-start-1 row-start-2 flex justify-center">
        <VerticalDimension>{width}</VerticalDimension>
      </div>
      <div
        className={cn(
          'col-start-2 row-start-2 grid place-items-center self-start rounded-sm border-2 px-2 text-center',
          measured ? 'border-foreground bg-inset' : 'border-dashed border-muted-foreground',
        )}
        style={{ aspectRatio: String(ratio) }}
      >
        {area}
      </div>
      <div className="col-span-2 col-start-1 row-start-3 flex min-h-40 justify-center sm:col-span-1 sm:col-start-3 sm:row-start-2 sm:min-h-0">
        <VerticalDimension>{ceiling}</VerticalDimension>
      </div>
    </div>
  );
}

/**
 * A room as a small plan for lists (OD-140): its outline drawn to its own proportions inside an
 * 80 × 56 box, solid when it's measured, dashed and square when it isn't, so the Rooms list
 * shows each room's shape instead of a row of identical empty pictures.
 */
export function RoomOutline({
  lengthIn,
  widthIn,
  className,
}: {
  lengthIn: Inches | null | undefined;
  widthIn: Inches | null | undefined;
  className?: string;
}) {
  const measured = lengthIn != null && widthIn != null && lengthIn > 0 && widthIn > 0;
  // The same 3:1 limit as the floor plan, so a corridor stays legible.
  const ratio = measured ? Math.min(3, Math.max(1 / 3, lengthIn / widthIn)) : 1;
  // Fit the box: wide rooms take its width, deep ones its height.
  const w = ratio >= 80 / 56 ? 80 : 56 * ratio;
  const h = w / ratio;
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-inset bg-[linear-gradient(var(--grid)_1px,transparent_1px),linear-gradient(90deg,var(--grid)_1px,transparent_1px)] bg-size-[8px_8px]',
        className,
      )}
    >
      <span
        className={cn(
          'block rounded-[2px] border-2',
          measured ? 'border-foreground bg-card' : 'border-dashed border-muted-foreground',
        )}
        style={{ width: Math.round(w * 0.75), height: Math.round(h * 0.75) }}
      />
    </span>
  );
}

const TICK = 'shrink-0 bg-muted-foreground';

/** A dimension along the top: end ticks, a line, the measurement in the middle. */
function HorizontalDimension({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full items-end gap-2">
      <span
        aria-hidden="true"
        className={cn(TICK, 'h-3.5 w-px')}
        style={{ marginBottom: 'calc(var(--dim-mid) - 0.4375rem)' }}
      />
      <span
        aria-hidden="true"
        className={cn(TICK, 'h-px min-w-0 flex-1')}
        style={{ marginBottom: 'var(--dim-mid)' }}
      />
      {/* Can shrink with its lines at large text, so the plan stays inside the panel (OD-142). */}
      <div className="w-24 max-w-[30vw] min-w-0 shrink sm:w-32 sm:max-w-none">{children}</div>
      <span
        aria-hidden="true"
        className={cn(TICK, 'h-px min-w-0 flex-1')}
        style={{ marginBottom: 'var(--dim-mid)' }}
      />
      <span
        aria-hidden="true"
        className={cn(TICK, 'h-3.5 w-px')}
        style={{ marginBottom: 'calc(var(--dim-mid) - 0.4375rem)' }}
      />
    </div>
  );
}

/** A dimension down the side: the same marks turned upright, the measurement in the middle. */
function VerticalDimension({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center gap-2">
      <span aria-hidden="true" className={cn(TICK, 'h-px w-3.5')} />
      <span aria-hidden="true" className={cn(TICK, 'min-h-3 w-px flex-1')} />
      <div className="w-24 max-w-[30vw] shrink-0 sm:w-32 sm:max-w-none">{children}</div>
      <span aria-hidden="true" className={cn(TICK, 'min-h-3 w-px flex-1')} />
      <span aria-hidden="true" className={cn(TICK, 'h-px w-3.5')} />
    </div>
  );
}

/** A measurement as text, for people who can't edit: its name, then the length. */
export function MeasuredValue({ label, inches }: { label: string; inches: Inches | null }) {
  return (
    <div className="text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-xl leading-7 font-semibold tabular-nums">
        {inches == null ? (
          <span className="text-base font-normal text-muted-foreground">Not measured</span>
        ) : (
          <LengthText text={formatLength(inches)} />
        )}
      </p>
    </div>
  );
}

/**
 * "7' 3 1/2"" → 7' 3 ½" with the fraction as a true fraction (Archivo `frac`); only that part,
 * so the whole inches aren't turned into a numerator.
 */
function LengthText({ text }: { text: string }) {
  const m = /(\d+\/\d+)/.exec(text);
  if (!m) return <>{text}</>;
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length);
  return (
    <>
      {before}
      <span className="[font-variant-numeric:diagonal-fractions_tabular-nums]">{m[0]}</span>
      {after}
    </>
  );
}
