import { useSyncExternalStore } from 'react';
import { viewAsSchema, type ViewAs } from '@reparo/shared';

/**
 * Which role an admin is previewing the app as (OD-133, Q194–Q196): kept for this browser tab
 * only (sessionStorage), so a reload keeps it and closing the tab ends it. Going back to admin
 * is just clearing it here; it never waits on the API.
 */
const KEY = 'reparo:view-as';
const listeners = new Set<() => void>();

export function readViewAs(): ViewAs | null {
  try {
    const parsed = viewAsSchema.safeParse(sessionStorage.getItem(KEY));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Start or end a preview; the caller refetches so every page redraws for the new role. */
export function saveViewAs(viewAs: ViewAs | null): void {
  try {
    if (viewAs) sessionStorage.setItem(KEY, viewAs);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the preview simply doesn't stick.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useViewAs(): ViewAs | null {
  return useSyncExternalStore(subscribe, readViewAs, () => null);
}
