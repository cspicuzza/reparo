import { useBlocker } from '@tanstack/react-router';
import { use, useEffect } from 'react';
import { DiscardQuestion } from '@/components/discard-question';
import { PanelDirtyContext } from '@/lib/panel-dirty';

/**
 * Asks before leaving a page with unsaved changes (web.md → Editing; OD-73), for navigation in
 * the app and for closing or reloading the tab. TanStack Router 1.170 `useBlocker` with
 * `withResolver` (https://tanstack.com/router/v1/docs/framework/react/guide/navigation-blocking):
 * a blocked move waits while the form asks "Discard your changes?" in place, instead of the
 * browser's dialog (OD-114, Q138). Closing or reloading the tab still gets the browser's own
 * question; nothing else can run then. Inside an `EditPanel` it also tells the panel, so
 * closing the panel asks too (OD-76).
 */
export function UnsavedGuard({ when }: { when: boolean }) {
  const blocker = useBlocker({
    shouldBlockFn: () => true,
    enableBeforeUnload: when,
    disabled: !when,
    withResolver: true,
  });
  const setPanelDirty = use(PanelDirtyContext);
  useEffect(() => {
    setPanelDirty?.(when);
    return () => setPanelDirty?.(false);
  }, [when, setPanelDirty]);
  if (blocker.status !== 'blocked') return null;
  return <DiscardQuestion className="mt-4" onDiscard={blocker.proceed} onKeep={blocker.reset} />;
}
