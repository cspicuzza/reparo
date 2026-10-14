import { cn } from '@/lib/utils';
import { moneyTicks, progressTicks, tapeFraction, type Tick } from '@/lib/tape';

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
 * in dark mode the outline is yellow so the dark fill stays visible.
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
      {filled > 0 ? (
        <rect x="0" y={band} width={filled * 1000} height={h - band} className="fill-tape-ink" />
      ) : null}
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
