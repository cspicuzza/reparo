/**
 * Reparo's mark: a dashed arc (a stitch, or a tape measure's edge) ending in a tape-yellow dot.
 * The arc takes the text colour; the dot's outline keeps it visible on light surfaces.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
      <path
        d="M4 18 C 9 6, 19 6, 24 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="3.5 3"
      />
      <circle cx="24" cy="18" r="3" className="fill-tape stroke-tape-edge" strokeWidth="1" />
    </svg>
  );
}
