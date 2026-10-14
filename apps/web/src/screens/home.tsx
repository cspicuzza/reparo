import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

export function Home() {
  const trpc = useTRPC();
  const me = useQuery(trpc.health.ping.queryOptions());

  if (me.isPending) return <p className="text-muted-foreground">Checking who you are…</p>;
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
      <p className="mt-2 text-muted-foreground">
        Role: {me.data.member.role}. Start with Rooms, then add jobs from each Item&apos;s page.
      </p>
    </section>
  );
}
