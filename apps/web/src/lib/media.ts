import { useSyncExternalStore } from 'react';

/**
 * Below Tailwind's `sm` (40rem): the phone layout of lists such as Shopping's rows, for the few
 * things CSS can't switch on its own (what's in Tab order, what starts folded; OD-137). In rem,
 * like Tailwind's breakpoints, so a larger browser text size moves both together (OD-142).
 */
const PHONE = '(width < 40rem)';

function subscribe(onChange: () => void) {
  const list = window.matchMedia(PHONE);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}
