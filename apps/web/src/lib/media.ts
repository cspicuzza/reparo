import { useSyncExternalStore } from 'react';

/**
 * Below Tailwind's `sm` (40rem): the phone layout of lists such as Shopping's rows, for the few
 * things CSS can't switch on its own (what's in Tab order, what starts folded; OD-137). In rem,
 * like Tailwind's breakpoints, so a larger browser text size moves both together (OD-142).
 */
const PHONE = '(width < 40rem)';

/**
 * One MediaQueryList for the whole app, made on first use (not at import), instead of a new one
 * for every subscribe and every snapshot read (OD-156). `subscribe` and `getSnapshot` stay at
 * module level, so React never resubscribes
 * (https://react.dev/reference/react/useSyncExternalStore).
 */
let phoneQuery: MediaQueryList | null = null;
const query = () => (phoneQuery ??= window.matchMedia(PHONE));

function subscribe(onChange: () => void) {
  const list = query();
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

const getSnapshot = () => query().matches;
const getServerSnapshot = () => false;

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
