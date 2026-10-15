import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { PanelDirtyContext } from '@/lib/panel-dirty';

/** The first field a person would type into. */
const FIELD =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

/**
 * Where adding and multi-field editing happen (web.md → Editing; Workflow polish, OD-76): a
 * panel over the page, which stays visible behind it. On a phone it rises from the bottom and
 * fills nearly the whole screen; on a laptop it slides in from the right. Built on Base UI's
 * Dialog (@base-ui/react 1.9.0), like the Menu sheet: it traps focus, closes on Escape and
 * returns focus to what opened it. Opening focuses the first field. Closing with unsaved
 * changes asks first (a form inside reports them through `UnsavedGuard`).
 *
 * The panel is a size container, so forms inside lay out by the panel's width (`@lg:`), not
 * the window's.
 */
export function EditPanel({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        if (dirty && !window.confirm('Close without saving your changes?')) return;
        setDirty(false);
        onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-scrim transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          ref={popup}
          initialFocus={() => popup.current?.querySelector<HTMLElement>(FIELD) ?? true}
          className="fixed inset-x-0 top-[max(2.5rem,env(safe-area-inset-top))] bottom-0 z-50 flex flex-col overflow-hidden rounded-t-xl border-t border-border bg-popover text-base text-popover-foreground shadow-lg transition-[opacity,translate] duration-200 ease-out outline-none data-ending-style:translate-y-6 data-ending-style:opacity-0 data-starting-style:translate-y-6 data-starting-style:opacity-0 sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[min(36rem,100vw)] sm:rounded-none sm:border-t-0 sm:border-l sm:data-ending-style:translate-x-8 sm:data-ending-style:translate-y-0 sm:data-starting-style:translate-x-8 sm:data-starting-style:translate-y-0"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 sm:px-6">
            <Dialog.Title className="min-w-0 truncate text-2xl">{title}</Dialog.Title>
            <Dialog.Close className={buttonVariants({ variant: 'ghost', className: '-mr-2' })}>
              <X aria-hidden className="size-5" />
              Close
            </Dialog.Close>
          </div>
          <div className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6">
            <PanelDirtyContext value={setDirty}>{children}</PanelDirtyContext>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
