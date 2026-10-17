import { trpcErrorCode } from '@/lib/trpc';

/**
 * Why something didn't load, in household words rather than the raw error (OD-110, Q122). The
 * reason goes after "Couldn't load …", so it reads as one message with Try again beside it.
 */
export function loadProblem(error: unknown): string {
  switch (trpcErrorCode(error)) {
    case 'UNAUTHORIZED':
      return 'Your sign-in has run out. Sign in again, then try again.';
    case 'FORBIDDEN':
      return "This account can't see it.";
    case 'NOT_FOUND':
      return "It isn't here any more.";
    case undefined:
      break;
    default:
      return 'Something went wrong on the server.';
  }
  const message = error instanceof Error ? error.message : '';
  // fetch's network failures: Chrome "Failed to fetch", Firefox "NetworkError…", Safari "Load failed".
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return "The connection dropped. Check you're online, then try again.";
  }
  return 'Something went wrong on the server.';
}

/** The part of a query a section needs to show loading and load errors honestly. */
export type QuerySource = { isPending: boolean; error: unknown; refetch: () => unknown };
