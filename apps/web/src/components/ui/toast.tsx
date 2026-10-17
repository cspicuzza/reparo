import { Toast } from '@base-ui/react/toast';
import { useEffect, useRef } from 'react';
import { buttonVariants } from '@/components/ui/button';

/*
 * Short messages after an action, with an optional action such as Undo (Workflow polish, OD-72).
 * Built on Base UI's Toast (@base-ui/react 1.9.0, docs/react/components/toast.md in the package),
 * styled by hand for Plaster and tape rather than Base UI's stacked demo:
 * - Messages stack plainly, newest last, above the phone's bottom bar and in the corner on a
 *   laptop. A popover surface with the floating shadow (it floats), 10px corners.
 * - Words, not icons: the action and Dismiss are labelled 44px buttons.
 * - Toasts are announced politely by Base UI and never take focus. From the keyboard, F6 moves
 *   into them (Base UI), and Ctrl+Z (Command+Z on a Mac) presses the newest Undo while focus
 *   isn't in a field; both are said in the message for screen readers, and the shortcut is
 *   shown on a laptop (OD-136).
 * - Only an opacity fade, so reduced motion needs nothing special.
 */

export function ToastProvider(props: Toast.Provider.Props) {
  return <Toast.Provider {...props} />;
}

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const UNDO_KEYS = MAC ? 'Command+Z' : 'Ctrl+Z';

/** Typing somewhere that has its own undo. */
function inField(el: EventTarget | null) {
  return (
    el instanceof HTMLElement && el.closest('input, textarea, select, [contenteditable]') !== null
  );
}

export function Toaster() {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || e.shiftKey || e.altKey) return;
      if (!(MAC ? e.metaKey : e.ctrlKey) || inField(e.target)) return;
      const actions = viewport.current?.querySelectorAll<HTMLButtonElement>('[data-undo]');
      const newest = actions?.[actions.length - 1];
      if (!newest) return;
      e.preventDefault();
      newest.click();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <Toast.Portal>
      <Toast.Viewport
        ref={viewport}
        className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col gap-2 outline-none md:right-6 md:bottom-6 md:left-auto md:w-[24rem]"
      >
        <ToastList />
      </Toast.Viewport>
    </Toast.Portal>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => {
    const undoable = toast.actionProps?.children === 'Undo';
    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        // The other theme, so a message stands clear of the page (OD-126, Q175–Q176).
        className="ink rounded-xl border border-border bg-popover text-popover-foreground shadow-lg transition-opacity duration-150 data-ending-style:opacity-0 data-limited:hidden data-starting-style:opacity-0"
      >
        <Toast.Content className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
          <div className="min-w-0 flex-1 py-1.5">
            <Toast.Title className="font-semibold" />
            <Toast.Description className="text-sm text-muted-foreground" />
            {undoable ? (
              <p className="text-sm text-muted-foreground">
                <span className="sr-only">Press F6 to reach Undo, or </span>
                <span aria-hidden className="hidden md:inline">
                  Or press{' '}
                </span>
                <span className="sr-only md:not-sr-only">{UNDO_KEYS}</span>
                <span className="sr-only"> to undo.</span>
              </p>
            ) : null}
          </div>
          <div className="-mr-2 flex items-center gap-1">
            {toast.actionProps ? (
              <Toast.Action
                data-undo={undoable ? '' : undefined}
                className={buttonVariants({ variant: 'default' })}
              />
            ) : null}
            <Toast.Close className={buttonVariants({ variant: 'ghost', className: 'px-3' })}>
              Dismiss
            </Toast.Close>
          </div>
        </Toast.Content>
      </Toast.Root>
    );
  });
}
