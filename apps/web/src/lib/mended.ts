/**
 * The "mended" stitch (Linear → Design system → Motion): when a status is saved as Completed,
 * the logo's dashed arc stitches closed once. A window event keeps it out of app state; the
 * header logo listens. Reduced motion turns the animation off (index.css).
 */
export const MENDED_EVENT = 'reparo:mended';

export function celebrateMended(): void {
  window.dispatchEvent(new Event(MENDED_EVENT));
}
