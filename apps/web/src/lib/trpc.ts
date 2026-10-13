import type { AppRouter } from '@reparo/api';
import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { accessToken } from './supabase';

// https://trpc.io/docs/client/tanstack-react-query/setup
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      headers: authHeaders,
    }),
  ],
});

/** Bearer header from the current Supabase session; empty when signed out. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** tRPC error code (`UNAUTHORIZED`, `FORBIDDEN`, …) from any thrown value, without `any`. */
export function trpcErrorCode(e: unknown): string | undefined {
  if (!(e instanceof TRPCClientError)) return undefined;
  const data: unknown = e.data;
  if (data && typeof data === 'object' && 'code' in data && typeof data.code === 'string') {
    return data.code;
  }
  return undefined;
}
