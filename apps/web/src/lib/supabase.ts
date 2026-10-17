import { AuthClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Sign-in for the browser, on the publishable key (https://supabase.com/docs/guides/api/api-keys).
 * PKCE with automatic code exchange on return from Google
 * (https://supabase.com/docs/guides/auth/sessions/pkce-flow) — set explicitly, not relied on as defaults.
 *
 * Only the auth client, not `createClient` (OD-141, Q209): the app uses Supabase for sign-in
 * alone (pictures go through signed upload links from the API), and the full client pulled the
 * database, realtime, storage and functions clients into the first download. supabase-js
 * re-exports auth-js's `AuthClient` and is marked side-effect free, so the rest is left out.
 * It's set up the way supabase-js 2.117.3 sets up its own (`SupabaseClient` constructor and
 * `_initSupabaseAuthClient` in dist/index.mjs): the auth URL, the key as `apikey` and bearer,
 * and the same storage key (`sb-<first part of the host>-auth-token`), so existing sessions
 * carry over.
 */
const base = new URL(env.VITE_SUPABASE_URL);
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;

const auth = new AuthClient({
  url: new URL('auth/v1', base.href.endsWith('/') ? base.href : `${base.href}/`).href,
  headers: { Authorization: `Bearer ${key}`, apikey: key },
  storageKey: `sb-${base.hostname.split('.')[0]}-auth-token`,
  flowType: 'pkce',
  detectSessionInUrl: true,
  persistSession: true,
  autoRefreshToken: true,
});

/** Shaped like the full client's `supabase.auth`, so callers read the same. */
export const supabase = { auth };

export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/` },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Current access token, or null when signed out. */
export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
