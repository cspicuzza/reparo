import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * One client for the browser, on the publishable key (https://supabase.com/docs/guides/api/api-keys).
 * PKCE with automatic code exchange on return from Google
 * (https://supabase.com/docs/guides/auth/sessions/pkce-flow) — set explicitly, not relied on as defaults.
 */
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});

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
