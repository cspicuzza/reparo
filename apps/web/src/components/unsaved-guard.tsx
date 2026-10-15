import { useBlocker } from '@tanstack/react-router';

/**
 * Asks before leaving a page with unsaved changes (web.md → Editing; OD-73), for navigation in
 * the app and for closing or reloading the tab. TanStack Router 1.170 `useBlocker`
 * (https://tanstack.com/router/v1/docs/framework/react/guide/navigation-blocking):
 * `shouldBlockFn` returning true keeps the person on the page.
 */
export function UnsavedGuard({ when }: { when: boolean }) {
  useBlocker({
    shouldBlockFn: () => !window.confirm('Leave without saving your changes?'),
    enableBeforeUnload: when,
    disabled: !when,
  });
  return null;
}
