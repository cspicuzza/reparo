import { createContext } from 'react';

/**
 * Lets a form inside an `EditPanel` tell the panel it has unsaved changes, so closing the panel
 * asks first (OD-76). Outside a panel it's null and nothing listens.
 */
export const PanelDirtyContext = createContext<((dirty: boolean) => void) | null>(null);
