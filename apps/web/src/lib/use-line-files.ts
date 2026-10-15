import { useQuery } from '@tanstack/react-query';
import type { ShoppingLine } from './shopping';
import { useTRPC } from './trpc';

/** The pictures and receipts for a list of lines, in one request (M4, OD-59). */
export function useLineFiles(lines: ShoppingLine[] | undefined) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.files.listMany.queryOptions({
      ownerType: 'shopping_line',
      ownerIds: (lines ?? []).map((l) => l.id),
    }),
    enabled: (lines?.length ?? 0) > 0,
  });
}
