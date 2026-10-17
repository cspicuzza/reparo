import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './trpc';
import { useViewAs } from './view-as';

/**
 * The signed-in member (from `health.ping`) and whether they may change things. While an admin
 * previews another role (OD-133), `role`, `canEdit` and `isAdmin` follow the previewed role, the
 * same way the API treats them; `realRole` and `isRealAdmin` stay the truth, so the preview
 * switch and "Back to admin" are always there for a real admin.
 */
export function useMe() {
  const trpc = useTRPC();
  const me = useQuery(trpc.health.ping.queryOptions());
  const stored = useViewAs();
  const realRole = me.data?.realRole;
  const viewAs = realRole === 'admin' ? stored : null;
  // The local choice applies at once; the API's answer catches up on the refetch.
  const role = viewAs ?? me.data?.member.role;
  return {
    member: me.data?.member,
    role,
    realRole,
    viewAs,
    canEdit: role === 'editor' || role === 'admin',
    isAdmin: role === 'admin',
    isRealAdmin: realRole === 'admin',
  };
}
