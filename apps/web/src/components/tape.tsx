import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import {
  COMMITTED_STRIPES,
  moneyTicks,
  progressTicks,
  tapeFraction,
  type BudgetSegments,
  type Tick,
} from '@/lib/tape';

type Common = {
  /** What the strip shows, in words, for screen readers. Always also written next to it. */
  label: string;
  size?: 'md' | 'sm';
  className?: string;
};

type TapeProps = Common &
  (
    | { mode: 'progress'; done: number; total: number }
    | { mode: 'money'; usedCents: number; totalCents: number; stepCents: number }
  );

const SIZES = { md: { h: 30, band: 12 }, sm: { h: 16, band: 6 } } as const;

/**
 * The tape-measure strip: tick marks along the top, a dark fill from the left for work done
 * or money committed, yellow for what's left. Values come from the API (web.md); this only
 * draws them. In light mode the tape is outlined in ink (yellow alone is 1.7:1 on panels);
 * in dark mode the outline is yellow and the fill a lighter grey, so a full tape doesn't
 * read as empty (OD-109, Q117).
 */
export function TapeStrip(props: TapeProps) {
  const { label, size = 'md', className } = props;
  const { h, band } = SIZES[size];
  let filled: number;
  let ticks: Tick[];
  if (props.mode === 'progress') {
    filled = tapeFraction(props.done, props.total);
    ticks = progressTicks(props.total);
  } else {
    filled = tapeFraction(props.usedCents, props.totalCents);
    ticks = moneyTicks(props.totalCents, props.stepCents);
  }
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 1000 ${h}`}
      preserveAspectRatio="none"
      className={cn('block w-full overflow-visible', className)}
      style={{ height: h }}
    >
      <rect x="0" y="0" width="1000" height={h} rx="3" className="fill-tape" />
      {/* Scaled rather than resized, so a new value slides in (OD-81) without layout work.
          Always drawn, even empty, so the first payment or purchase slides in from zero rather
          than popping in (OD-131, Q188). A tape that first appears already filled doesn't move:
          nothing animates on page load. Reduced motion drops the slide (index.css). */}
      <rect
        x="0"
        y={band}
        width="1000"
        height={h - band}
        style={{
          transform: `scaleX(${filled})`,
          transformBox: 'fill-box',
          transformOrigin: 'left',
        }}
        className="fill-tape-fill transition-transform duration-300 ease-out"
      />
      {ticks.map((t) => (
        <line
          key={t.at}
          x1={t.at * 1000}
          x2={t.at * 1000}
          y1="0"
          y2={t.major ? band - 1 : props.mode === 'progress' ? band - 1 : band * 0.55}
          className="stroke-tape-ink"
          strokeWidth={t.major ? 1.6 : 1.1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* Outline last, so the fill never covers it. */}
      <rect
        x="0"
        y="0"
        width="1000"
        height={h}
        rx="3"
        className="fill-none stroke-tape-edge"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * The budget as a tape (OD-109, Q115–Q116): spent (solid), committed (striped), yellow for
 * what's left. When spending and commitments pass the budget, the strip runs to their total,
 * the budget's end gets a full-height mark, and the overrun past it is red. Drawn in HTML
 * rather than SVG so the stripes keep their shape at any width; the ticks are an SVG on top.
 */
export function BudgetTapeStrip({
  segments,
  stepCents,
  label,
  className,
}: {
  segments: BudgetSegments;
  stepCents: number;
  label: string;
  className?: string;
}) {
  const { h, band } = SIZES.md;
  const ticks = moneyTicks(segments.scaleCents, stepCents);
  const part = (start: number, size: number): CSSProperties => ({
    left: `${start * 100}%`,
    width: `${size * 100}%`,
    top: band,
    bottom: 0,
  });
  const fill = 'absolute transition-[left,width] duration-300 ease-out';
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('relative overflow-hidden rounded-sm bg-tape', className)}
      style={{ height: h }}
    >
      {/* Every part is drawn even at zero width, so a first payment or a first overrun slides
          in rather than popping in (OD-131, Q188). */}
      <span aria-hidden className={cn(fill, 'bg-tape-fill')} style={part(0, segments.spent)} />
      <span
        aria-hidden
        className={fill}
        style={{ ...COMMITTED_STRIPES, ...part(segments.spent, segments.committed) }}
      />
      <span
        aria-hidden
        className={cn(fill, 'bg-destructive')}
        style={{ ...part(segments.budgetAt, segments.over), top: 0 }}
      />
      <svg
        aria-hidden
        viewBox={`0 0 1000 ${h}`}
        preserveAspectRatio="none"
        className="absolute inset-0 block size-full overflow-visible"
      >
        {ticks.map((t) => (
          <line
            key={t.at}
            x1={t.at * 1000}
            x2={t.at * 1000}
            y1="0"
            y2={t.major ? band - 1 : band * 0.55}
            className="stroke-tape-ink"
            strokeWidth={t.major ? 1.6 : 1.1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {segments.over > 0 ? (
          // Where the budget ends, the full height of the strip (Q115).
          <line
            x1={segments.budgetAt * 1000}
            x2={segments.budgetAt * 1000}
            y1="0"
            y2={h}
            className="stroke-tape-edge"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      {/* Outline last, so no fill covers it. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-sm border-[1.5px] border-tape-edge"
      />
    </div>
  );
}
