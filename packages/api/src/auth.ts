import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';

/** The claims we rely on from a Supabase Auth access token (https://supabase.com/docs/guides/auth/jwts). */
export const tokenClaimsSchema = z.object({
  sub: z.uuid(),
  email: z.email(),
});
export type TokenClaims = z.infer<typeof tokenClaimsSchema>;

/** Returns claims for a valid token, or null for anything else. Never throws. */
export type TokenVerifier = (token: string) => Promise<TokenClaims | null>;

export interface VerifierOptions {
  /** `SUPABASE_JWKS_URL` — public keys; https://supabase.com/docs/guides/auth/signing-keys */
  jwksUrl: string;
  /** Supabase sets `iss` to `<SUPABASE_URL>/auth/v1`. */
  issuer: string;
  /** Test seam: supply a key resolver instead of fetching JWKS. */
  getKey?: JWTVerifyGetKey;
}

/**
 * Verify a Supabase user access token locally against the project's JWKS (ES256), per
 * https://supabase.com/docs/guides/auth/jwts. jose caches the key set and refetches on an
 * unknown `kid` after a cooldown, which covers key rotation.
 */
export function createTokenVerifier(opts: VerifierOptions): TokenVerifier {
  const getKey = opts.getKey ?? createRemoteJWKSet(new URL(opts.jwksUrl));
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, getKey, {
        issuer: opts.issuer,
        algorithms: ['ES256'],
      });
      const parsed = tokenClaimsSchema.safeParse(payload);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };
}

/** Supabase's issuer for a given project URL. */
export function supabaseIssuer(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
}
