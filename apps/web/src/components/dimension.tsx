import { formatLength, type Inches } from '@reparo/shared';
import { cn } from '@/lib/utils';

/**
 * A measurement drawn like a drafting dimension: end ticks, a line, the length in the middle.
 * The fraction part ("1/2") is set with true fractions (Archivo `frac`); only that part, so the
 * whole inches aren't turned into a numerator.
 */
export function DimensionLine({
  label,
  inches,
  className,
}: {
  label: string;
  inches: Inches | null | undefined;
  className?: string;
}) {
  return (
    <div className={cn('min-w-36', className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-center gap-2">
        {inches == null ? (
          <span className="text-muted-foreground">Not measured</span>
        ) : (
          <>
            <Tick />
            <Line />
            <span className="text-lg font-semibold tabular-nums">
              <LengthText text={formatLength(inches)} />
            </span>
            <Line />
            <Tick />
          </>
        )}
      </dd>
    </div>
  );
}

function Tick() {
  return <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-muted-foreground" />;
}

function Line() {
  return <span aria-hidden="true" className="h-px min-w-3 flex-1 bg-muted-foreground" />;
}

/** "7' 3 1/2"" → 7' 3 ½" with the fraction as a true fraction. */
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
