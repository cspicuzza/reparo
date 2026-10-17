import { useCallback, useEffect, useRef } from 'react';

/** The first field a person would type into, inside `root`. */
const FIELD =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

/**
 * Focus the first field when an editor opens (web.md → Editing; OD-73). Attach the returned ref
 * to the form. Runs once, when the form first appears: editors mount when someone opens them,
 * and one that waits for its data shows the form a moment later (OD-145).
 */
export function useFocusFirstField<T extends HTMLElement>() {
  const done = useRef(false);
  return useCallback((el: T | null) => {
    if (!el || done.current) return;
    done.current = true;
    el.querySelector<HTMLElement>(FIELD)?.focus();
  }, []);
}

/**
 * Hand focus back to the control that opened an editor when it closes (OD-73). Editors replace
 * the button that opened them, so without this focus falls to the top of the page.
 *
 * Pass a key naming what's open (or null when nothing is), and put the same key on the opener
 * as `data-return-focus`. When the key goes back to null, that opener gets focus.
 */
export function useReturnFocus(openKey: string | null) {
  const last = useRef(openKey);
  useEffect(() => {
    const was = last.current;
    last.current = openKey;
    if (was === null || openKey !== null) return;
    const frame = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-return-focus="${CSS.escape(was)}"]`)
        ?.focus({ preventScroll: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [openKey]);
}
