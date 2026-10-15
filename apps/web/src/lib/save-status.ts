import { useEffect, useState } from 'react';

/** What a save shows beside its control (web.md → Saving). */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** The parts of a TanStack Query mutation a save display needs. */
export type SaveLike = {
  status: 'idle' | 'pending' | 'success' | 'error';
  submittedAt: number;
};

/** How long "Saved" stays up after a save lands. */
export const SAVED_FOR_MS = 2500;

/**
 * A save's status from its mutation's status. "Saved" shows for a moment after each save and
 * then clears, so a later look at the screen doesn't read an old confirmation as a new one.
 */
export function saveStatusOf(status: SaveLike['status'], savedVisible: boolean): SaveStatus {
  if (status === 'pending') return 'saving';
  if (status === 'error') return 'error';
  if (status === 'success' && savedVisible) return 'saved';
  return 'idle';
}

export function useSaveStatus(m: SaveLike): SaveStatus {
  // The submission that has finished showing "Saved"; a new one shows it again.
  const [expired, setExpired] = useState(0);
  useEffect(() => {
    if (m.status !== 'success') return;
    const at = m.submittedAt;
    const timer = setTimeout(() => setExpired(at), SAVED_FOR_MS);
    return () => clearTimeout(timer);
  }, [m.status, m.submittedAt]);
  return saveStatusOf(m.status, expired !== m.submittedAt);
}
