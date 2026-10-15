import type { RouterOutputs } from '@reparo/api';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CircleAlert } from 'lucide-react';
import { PlanGrid } from '@/components/plan-grid';
import { StatusBadge } from '@/components/status';
import { TapeStrip } from '@/components/tape';
import { buttonVariants } from '@/components/ui/button';
import { MoneyTape } from '@/components/money-tape';
import { formatMoney } from '@reparo/shared';
import { headline, listText, plannedPhaseText } from '@/lib/money';
import { greeting } from '@/lib/home';
import { useMe } from '@/lib/me';
import { roomProgressText } from '@/lib/rooms';
import { useTRPC } from '@/lib/trpc';
import { progressText } from '@/lib/work';

type Summary = RouterOutputs['home']['summary'];

/** Room tiles shown on Home; the rest are one tap away. */
const HOME_ROOMS = 8;

/**
 * Home (OD-41, OD-53): the money left to spend, what needs someone, how the current phase is
 * going, and the rooms. Every number comes from `home.summary`.
 */
export function Home() {
  const trpc = useTRPC();
  const { member } = useMe();
  const summary = useQuery(trpc.home.summary.queryOptions());

  const hello = greeting(new Date(), member?.displayName);
  return (
    <div className="flex flex-col gap-8">
      {summary.isPending ? (
        <>
          <h1 className="text-3xl">{hello}</h1>
          <p className="text-muted-foreground">Loading the house…</p>
        </>
      ) : summary.error ? (
        <>
          <h1 className="text-3xl">{hello}</h1>
          <p role="alert">Couldn&apos;t load Home: {summary.error.message}</p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-start gap-6">
            <MoneyHeadline greeting={hello} money={summary.data.money} />
            <NeedsYou items={summary.data.needsYou} />
          </div>
          <PhasePanel summary={summary.data} />
          <Rooms rooms={summary.data.rooms} />
        </>
      )}
    </div>
  );
}

/**
 * The money sentence and tape (canvas section D): what's left to spend after everything spent
 * and planned in the phases that count, and what each planned phase would do to it.
 */
function MoneyHeadline({
  greeting: hello,
  money: m,
}: {
  greeting: string;
  money: Summary['money'];
}) {
  const { lead, amount, tail } = headline(m.availableCents);
  return (
    <section aria-labelledby="money" className="min-w-0 flex-[999_1_32rem]">
      <p className="text-muted-foreground">{hello}</p>
      {m.poolCents === 0 ? (
        <>
          <h1 id="money" className="mt-1 text-4xl">
            The budget isn&apos;t in yet.
          </h1>
          <p className="mt-2 text-muted-foreground">
            Once the starting balance is entered, this says what&apos;s left to spend.{' '}
            <Link to="/money" className="text-foreground underline underline-offset-4">
              Go to Money
            </Link>
          </p>
        </>
      ) : (
        <>
          <h1 id="money" className="mt-1 text-4xl tabular-nums">
            {lead}
            <span className={m.availableCents < 0 ? 'text-destructive' : undefined}>{amount}</span>
            {tail}
          </h1>
          <p className="mt-2 mb-5 text-muted-foreground">
            That&apos;s what remains of the {formatMoney(m.poolCents)} budget after everything spent
            {m.countingPhases.length > 0 ? ` and planned for ${listText(m.countingPhases)}` : ''}.
          </p>
          <MoneyTape
            poolCents={m.poolCents}
            spentCents={m.spentCents}
            committedCents={m.committedCents}
            availableCents={m.availableCents}
          />
          {m.plannedPhases.length > 0 ? (
            <div className="mt-5 flex flex-col gap-1 border-t border-border pt-4 tabular-nums">
              {m.plannedPhases.map((p) => {
                const line = plannedPhaseText({ ...p, leavesCents: p.leavesCents ?? 0 });
                return (
                  <p key={p.id}>
                    {line.text}
                    {line.amount ? (
                      <strong
                        className={line.short ? 'font-semibold text-destructive' : 'font-semibold'}
                      >
                        {line.amount}
                      </strong>
                    ) : null}
                    {line.amount ? '.' : null}
                  </p>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function NeedsYou({ items }: { items: Summary['needsYou'] }) {
  return (
    <section
      aria-labelledby="needs-you"
      className="min-w-0 flex-[1_1_20rem] rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex items-center gap-2.5">
        <h2 id="needs-you" className="text-2xl">
          Needs you
        </h2>
        {items.length > 0 ? (
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-tape px-2 font-bold text-tape-ink tabular-nums">
            {items.length}
          </span>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-muted-foreground">Nothing needs you right now.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {items.map((n) => (
            <li key={n.id} className="flex items-start gap-3 py-4 last:pb-0">
              <span className="mt-0.5 inline-flex shrink-0 rounded-lg bg-tape p-1 text-tape-ink">
                <CircleAlert aria-hidden className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{n.jobName}</p>
                <p className="text-sm text-muted-foreground">
                  {n.room
                    ? `${n.room.name} is done and ready to check.`
                    : 'Done and ready to check.'}
                </p>
                {n.room ? (
                  <Link
                    to="/rooms/$roomId"
                    params={{ roomId: n.room.id }}
                    className={buttonVariants({ variant: 'outline', className: 'mt-3' })}
                  >
                    Check it
                  </Link>
                ) : (
                  <Link
                    to="/jobs/$jobId"
                    params={{ jobId: n.jobId }}
                    className={buttonVariants({ variant: 'outline', className: 'mt-3' })}
                  >
                    Check it
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PhasePanel({ summary }: { summary: Summary }) {
  const { phase, phaseJobs } = summary;
  return (
    <section aria-labelledby="phase" className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="phase" className="text-2xl">
          {phase == null
            ? 'No phases yet'
            : phase.status === 'active'
              ? `${phase.name} is underway`
              : `${phase.name} is next`}
        </h2>
        <Link to="/phases" className={buttonVariants({ variant: 'link', className: 'px-0' })}>
          See all phases
        </Link>
      </div>
      {phase == null ? null : phaseJobs.length === 0 ? (
        <p className="mt-3 text-muted-foreground">
          No jobs in {phase.name} yet. Add them on the Jobs page.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {phaseJobs.map((j) => {
            const count = progressText(j.progress, j.roomCount);
            return (
              <li
                key={j.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,11rem)]"
              >
                <Link
                  to="/jobs/$jobId"
                  params={{ jobId: j.id }}
                  className="truncate font-semibold underline-offset-4 hover:underline"
                >
                  {j.name}
                </Link>
                {j.roomCount > 0 ? (
                  <>
                    <TapeStrip
                      mode="progress"
                      size="sm"
                      done={j.progress.done}
                      total={j.progress.total}
                      label={`${j.name}: ${count}`}
                      className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
                    />
                    <span className="text-right text-sm text-muted-foreground tabular-nums sm:text-left sm:text-base">
                      {count}
                    </span>
                  </>
                ) : (
                  <span className="justify-self-end sm:col-span-2 sm:justify-self-start">
                    <StatusBadge status={j.progress.status} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Rooms({ rooms }: { rooms: Summary['rooms'] }) {
  return (
    <section aria-labelledby="rooms">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rooms" className="text-2xl">
          Rooms
        </h2>
        <Link to="/rooms" className={buttonVariants({ variant: 'link', className: 'px-0' })}>
          {rooms.length > HOME_ROOMS ? `See all ${rooms.length} rooms` : 'All rooms'}
        </Link>
      </div>
      {rooms.length === 0 ? (
        <p className="mt-3 text-muted-foreground">
          No rooms yet.{' '}
          <Link to="/rooms" className="text-foreground underline underline-offset-4">
            Add the first one
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {rooms.slice(0, HOME_ROOMS).map((r) => (
            <li key={r.id}>
              <Link
                to="/rooms/$roomId"
                params={{ roomId: r.id }}
                className="block overflow-hidden rounded-xl border border-border bg-card hover:border-input"
              >
                <PlanGrid className="h-24 sm:h-32">No picture yet</PlanGrid>
                <div className="p-3 sm:p-4">
                  <p className="text-xl font-semibold">{r.name}</p>
                  {r.awaitingReview ? (
                    <span className="mt-1 inline-block">
                      <StatusBadge status="awaiting_review" />
                    </span>
                  ) : (
                    <p className="text-sm text-muted-foreground">{roomProgressText(r.progress)}</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
