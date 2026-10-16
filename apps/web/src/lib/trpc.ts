import type { AppRouter } from '@reparo/api';
import { QueryClient, replaceEqualDeep } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import { createTRPCContext, createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { createLinkKeeper } from './stable-links';
import { accessToken } from './supabase';

// https://trpc.io/docs/client/tanstack-react-query/setup
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

const links = createLinkKeeper();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
      // Picture links stay the same across refetches while fresh, so pictures don't download
      // again (OD-115, Q172); then the usual structural sharing.
      // https://tanstack.com/query/v5/docs/framework/react/reference/useQuery (structuralSharing)
      structuralSharing: (oldData, newData) => replaceEqualDeep(oldData, links.stabilize(newData)),
    },
  },
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      headers: authHeaders,
    }),
  ],
});

/**
 * The same query options as `useTRPC()`, for use outside React: route loaders start a page's
 * queries before it renders (OD-115, Q137).
 * https://trpc.io/docs/client/tanstack-react-query/usage#queryoptions-outside-react
 */
export const trpcOptions = createTRPCOptionsProxy<AppRouter>({ client: trpcClient, queryClient });

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
