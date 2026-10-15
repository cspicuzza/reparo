import { useBlocker } from '@tanstack/react-router';
import { use, useEffect } from 'react';
import { PanelDirtyContext } from '@/lib/panel-dirty';

/**
 * Asks before leaving a page with unsaved changes (web.md → Editing; OD-73), for navigation in
 * the app and for closing or reloading the tab. TanStack Router 1.170 `useBlocker`
 * (https://tanstack.com/router/v1/docs/framework/react/guide/navigation-blocking):
 * `shouldBlockFn` returning true keeps the person on the page. Inside an `EditPanel` it also
 * tells the panel, so closing the panel asks too (OD-76).
 */
export function UnsavedGuard({ when }: { when: boolean }) {
  useBlocker({
    shouldBlockFn: () => !window.confirm('Leave without saving your changes?'),
    enableBeforeUnload: when,
    disabled: !when,
  });
  const setPanelDirty = use(PanelDirtyContext);
  useEffect(() => {
    setPanelDirty?.(when);
    return () => setPanelDirty?.(false);
  }, [when, setPanelDirty]);
  return null;
}
