import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './trpc';

/** The signed-in member (from `health.ping`) and whether they may change things. */
export function useMe() {
  const trpc = useTRPC();
  const me = useQuery(trpc.health.ping.queryOptions());
  const role = me.data?.member.role;
  return {
    member: me.data?.member,
    canEdit: role === 'editor' || role === 'admin',
    isAdmin: role === 'admin',
  };
}
