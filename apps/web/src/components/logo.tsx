import { useEffect, useState } from 'react';
import { MENDED_EVENT } from '@/lib/mended';

/**
 * Reparo's mark: a dashed arc (a stitch, or a tape measure's edge) ending in a tape-yellow dot.
 * The arc takes the text colour; the dot's outline keeps it visible on light surfaces.
 * With `mends`, the arc stitches closed once whenever a status is saved as Completed.
 */
export function LogoMark({ size = 28, mends = false }: { size?: number; mends?: boolean }) {
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!mends) return;
    const onMended = () => setRun((n) => n + 1);
    window.addEventListener(MENDED_EVENT, onMended);
    return () => window.removeEventListener(MENDED_EVENT, onMended);
  }, [mends]);

  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
      <path
        // A new key restarts the animation on each completion.
        key={run}
        d="M4 18 C 9 6, 19 6, 24 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="3.5 3"
        className={run > 0 ? 'animate-mend' : undefined}
      />
      <circle cx="24" cy="18" r="3" className="fill-tape stroke-tape-edge" strokeWidth="1" />
    </svg>
  );
}
