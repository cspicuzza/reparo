import { Toast } from '@base-ui/react/toast';

/** Show a short message, optionally with an action such as Undo (components/ui/toast.tsx). */
export const useToasts = () => Toast.useToastManager<object>();

type Toasts = ReturnType<typeof useToasts>;

/**
 * The Undo button for a toast (OD-145). Undo runs after the toast that offered it has gone, so
 * nothing on the page can show its error; if it fails, a second message says so and offers Try
 * again, instead of the change quietly staying.
 */
export function undoAction(toasts: Toasts, run: () => Promise<unknown>) {
  const attempt = () => {
    run().catch(() => {
      toasts.add({
        title: "Couldn't undo",
        description: 'The change is still there. Check the connection and try again.',
        timeout: 10_000,
        actionProps: { children: 'Try again', onClick: attempt },
      });
    });
  };
  return { children: 'Undo', onClick: attempt };
}
