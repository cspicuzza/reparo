import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

export function Home() {
  const trpc = useTRPC();
  const me = useQuery(trpc.health.ping.queryOptions());

  if (me.isPending) return <p className="text-pencil">Checking who you are…</p>;
  if (me.error) {
    return (
      <p role="alert">
        Couldn&apos;t reach the API: {me.error.message}. Is <code>pnpm dev</code> running?
      </p>
    );
  }
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">
        Signed in as {me.data.member.displayName}
      </h1>
      <p className="mt-2 text-pencil">
        Role: {me.data.member.role}. Phases, rooms, and items arrive with M1.
      </p>
    </section>
  );
}
