import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { DiscardQuestion } from '@/components/discard-question';
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
  heading,
  focusFirstField = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The panel's name; screen readers hear it when the panel opens. */
  title: string;
  /**
   * Shown in place of the title, such as the shopping line's name as a field you can edit
   * (OD-82, Q39). The title is then kept for screen readers only.
   */
  heading?: ReactNode;
  /**
   * Put the cursor in the first field on opening. Off for a panel that is mostly for reading,
   * so a phone doesn't raise its keyboard just because the panel opened (OD-82).
   */
  focusFirstField?: boolean;
  children: ReactNode;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  // Closing with unsaved changes asks in the panel, not in the browser's dialog (Q138).
  const [asking, setAsking] = useState(false);
  const close = useRef<HTMLButtonElement>(null);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        if (dirty) {
          setAsking(true);
          return;
        }
        setAsking(false);
        onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-scrim transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          ref={popup}
          // Lets the panel itself take focus when it opens without a field focused.
          tabIndex={-1}
          initialFocus={() =>
            focusFirstField
              ? (popup.current?.querySelector<HTMLElement>(FIELD) ?? true)
              : popup.current
          }
          className="fixed inset-x-0 top-[max(2.5rem,env(safe-area-inset-top))] bottom-0 z-50 flex flex-col overflow-hidden rounded-t-xl border-t border-border bg-popover text-base text-popover-foreground shadow-lg transition-[opacity,translate] duration-200 ease-out outline-none data-ending-style:translate-y-6 data-ending-style:opacity-0 data-starting-style:translate-y-6 data-starting-style:opacity-0 sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[min(36rem,100vw)] sm:rounded-none sm:border-t-0 sm:border-l sm:data-ending-style:translate-x-8 sm:data-ending-style:translate-y-0 sm:data-starting-style:translate-x-8 sm:data-starting-style:translate-y-0"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-2 sm:px-6">
            <Dialog.Title className={heading ? 'sr-only' : 'min-w-0 self-center truncate text-2xl'}>
              {title}
            </Dialog.Title>
            {heading ? <div className="min-w-0 flex-1">{heading}</div> : null}
            <Dialog.Close
              ref={close}
              className={buttonVariants({ variant: 'ghost', className: '-mr-2' })}
            >
              <X aria-hidden className="size-5" />
              Close
            </Dialog.Close>
          </div>
          {/* The body is the darker page tone so the light fields stand out against it; the
              header keeps the panel colour (OD-100, Q88). */}
          <div className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background px-4 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6">
            {asking ? (
              <DiscardQuestion
                className="mb-5"
                onDiscard={() => {
                  setAsking(false);
                  setDirty(false);
                  onClose();
                }}
                onKeep={() => {
                  setAsking(false);
                  close.current?.focus();
                }}
              />
            ) : null}
            <PanelDirtyContext value={setDirty}>{children}</PanelDirtyContext>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
