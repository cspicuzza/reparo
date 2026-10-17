/** The look of the app's sliding switch (`components/segmented-switch.tsx`; OD-142). */

/** The track, knob and one position, for a switch built from other radio items (View as's menu). */
export const SWITCH_TRACK = 'relative flex rounded-lg border border-input bg-inset p-0.5';
export const SWITCH_KNOB =
  'absolute inset-y-0.5 left-0.5 rounded-md border border-input bg-card shadow-knob transition-[transform,background-color] duration-200 ease-out';
export const SWITCH_POSITION =
  'relative z-10 flex min-h-11 flex-1 items-center justify-center rounded-md px-2 text-base transition-colors duration-150';

/** The knob's width and place for the picked one of `count` choices. */
export function knobStyle(index: number, count: number) {
  return {
    width: `calc((100% - 0.25rem) / ${count})`,
    transform: `translateX(${Math.max(0, index) * 100}%)`,
  };
}
