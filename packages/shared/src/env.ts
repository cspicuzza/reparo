// Environment contract. `.env.example` lists every variable; this file validates them.
// Runtime-agnostic: callers pass `import.meta.env` (web) or `process.env` (server).

import { z } from 'zod';

export const APP_ENVS = ['local', 'preview', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const nonEmpty = (name: string) => z.string().min(1, `${name} is required`);

/** Variables the browser bundle may see. Vite only exposes `VITE_*`. */
export const webEnvSchema = z.object({
  VITE_SUPABASE_URL: z.url({ error: 'VITE_SUPABASE_URL must be a URL' }),
  /** `sb_publishable_…` — browser-safe. https://supabase.com/docs/guides/api/api-keys */
  VITE_SUPABASE_PUBLISHABLE_KEY: nonEmpty('VITE_SUPABASE_PUBLISHABLE_KEY'),
});
export type WebEnv = z.infer<typeof webEnvSchema>;

/** `APP_ENV`: where the server runs. Only `local` shows raw server errors (OD-168). */
export const appEnvSchema = z.enum(APP_ENVS, {
  error: `APP_ENV must be one of ${APP_ENVS.join(', ')}`,
});

/** Server-only variables. Never import this from `apps/web/src`. */
export const serverEnvSchema = z.object({
  SUPABASE_URL: z.url({ error: 'SUPABASE_URL must be a URL' }),
  /** `sb_secret_…` — bypasses RLS; server only. */
  SUPABASE_SECRET_KEY: nonEmpty('SUPABASE_SECRET_KEY'),
  /** JWKS for verifying user access tokens. https://supabase.com/docs/guides/auth/signing-keys */
  SUPABASE_JWKS_URL: z.url({ error: 'SUPABASE_JWKS_URL must be a URL' }),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((s) => /^postgres(ql)?:\/\//.test(s), 'DATABASE_URL must start with postgres://'),
  APP_ENV: appEnvSchema,
});
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvError extends Error {
  constructor(
    public readonly problems: readonly string[],
    scope: string,
  ) {
    super(`Invalid ${scope} environment:\n  - ${problems.join('\n  - ')}\nSee .env.example.`);
    this.name = 'EnvError';
  }
}

function parse<T extends z.ZodType>(schema: T, source: unknown, scope: string): z.infer<T> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => {
    const key = issue.path.map(String).join('.') || '(root)';
    return `${key}: ${issue.message}`;
  });
  throw new EnvError(problems, scope);
}

/** Validate the web environment. Throws `EnvError` listing every problem at once. */
export function webEnv(source: unknown): WebEnv {
  return parse(webEnvSchema, source, 'web');
}

/** Validate the server environment. Throws `EnvError` listing every problem at once. */
export function serverEnv(source: unknown): ServerEnv {
  return parse(serverEnvSchema, source, 'server');
}
