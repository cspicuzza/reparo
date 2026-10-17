import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * Says so when the device is offline (OD-139). Saves wait while it is: TanStack Query pauses
 * them and sends them when the connection is back (networkMode "online", its default), as long
 * as the page stays open. Calm, in the other theme, across the top like the preview bar.
 */
export function OfflineBar() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div role="status" className="ink border-b border-border bg-popover text-popover-foreground">
      <p className="mx-auto max-w-6xl px-4 py-2 sm:px-6">
        <span className="font-semibold">You&apos;re offline.</span>{' '}
        <span className="text-muted-foreground">
          Changes will save when you&apos;re back online, as long as this page stays open.
        </span>
      </p>
    </div>
  );
}
