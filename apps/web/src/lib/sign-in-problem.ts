import type { AuthError } from '@supabase/supabase-js';

/**
 * Why Google sign-in didn't work, in household words (OD-169). Never the code or the server's
 * message. Codes: https://supabase.com/docs/guides/auth/debugging/error-codes
 */
export function signInProblem({
  error,
  code,
}: {
  error?: string | undefined;
  code?: string | undefined;
}): string | null {
  if (code === 'flow_state_expired' || code === 'flow_state_not_found') {
    return 'Sign-in took too long. Try again.';
  }
  if (code === 'over_request_rate_limit') {
    return 'Too many tries just now. Wait a few minutes, then try again.';
  }
  // Supabase Auth sends access_denied for sign-ups that are off, banned users and unverified
  // provider emails (external.go). Whether Google's own Cancel arrives as it too is unverified.
  if (error === 'access_denied') {
    return "This account can't sign in here. Use your household Google account.";
  }
  if (error !== undefined || code !== undefined) return "Sign-in didn't work. Try again.";
  return null;
}

/** When sign-in can't even start (Supabase unreachable, say). */
export const SIGN_IN_START_PROBLEM = "Couldn't start Google sign-in. Try again.";

/**
 * The error and code from what auth-js found on the address (auth-js 2.117.3 `initialize()`):
 * a failed redirect carries them in `details`; a failed code exchange in `code`.
 */
export function authErrorParts(e: AuthError | null): { error?: string; code?: string } {
  if (!e) return {};
  const details = 'details' in e ? (e.details as { error?: unknown; code?: unknown } | null) : null;
  const parts: { error?: string; code?: string } = {};
  if (typeof details?.error === 'string') parts.error = details.error;
  const code = typeof details?.code === 'string' && details.code ? details.code : e.code;
  if (code) parts.code = code;
  if (!parts.error && !parts.code) parts.error = 'unknown';
  return parts;
}
