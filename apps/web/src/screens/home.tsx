import type { RouterOutputs } from '@reparo/api';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CircleAlert } from 'lucide-react';
import { PageTitle } from '@/components/page-title';
import { StatusBadge } from '@/components/status';
import { TapeStrip } from '@/components/tape';
import { buttonVariants } from '@/components/ui/button';
import { MoneyTape } from '@/components/money-tape';
import { WelcomeNote } from '@/components/welcome-note';
import { formatIsoDate, formatMoney, isIsoDate } from '@reparo/shared';
import { headline, listText, plannedPhaseText } from '@/lib/money';
import { greeting, homeRoomOrder, phaseGlance, phaseHeading } from '@/lib/home';
import { useMe } from '@/lib/me';
import { roomProgressText } from '@/lib/rooms';
import { useTRPC } from '@/lib/trpc';
import { phaseProgressText, progressText } from '@/lib/work';
import { Bar, Loading, PanelShape } from '@/components/placeholder';
import { LoadError } from '@/components/load-error';

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
      <PageTitle parts={['Home']} />
      {summary.isPending ? (
        <>
          <h1 className="text-3xl">{hello}</h1>
          <Loading label="Loading the house">
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-3">
                <Bar className="h-10 w-4/5" />
                <Bar className="w-1/2" />
                <Bar className="mt-3 h-8 w-full" />
              </div>
              <PanelShape lines={6} />
            </div>
          </Loading>
        </>
      ) : summary.error ? (
        <>
          <h1 className="text-3xl">{hello}</h1>
          <LoadError what="Home" error={summary.error} retry={[summary]} className="mt-4" />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-start gap-6">
            <MoneyHeadline
              greeting={hello}
              money={summary.data.money}
              nothingNeedsYou={
                summary.data.needsYou.length + summary.data.expiringQuotes.length === 0 &&
                summary.data.money.availableCents >= 0
              }
            />
            <NeedsYou
              items={summary.data.needsYou}
              quotes={summary.data.expiringQuotes}
              overCents={Math.max(0, -summary.data.money.availableCents)}
            />
          </div>
          <WelcomeNote />
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
  nothingNeedsYou,
}: {
  greeting: string;
  money: Summary['money'];
  /** With nothing waiting, "Needs you" is this one line under the greeting (OD-116, Q121). */
  nothingNeedsYou: boolean;
}) {
  const { lead, amount, tail } = headline(m.availableCents);
  return (
    <section aria-labelledby="money" className="min-w-0 flex-[999_1_32rem]">
      <p className="text-muted-foreground">{hello}</p>
      {nothingNeedsYou ? (
        <p className="text-muted-foreground">Nothing needs you right now.</p>
      ) : null}
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
          {m.availableCents < 0 ? (
            // Over budget: what it's made of, in one line, so the number isn't read as money
            // already gone (OD-138; the "what remains" line would contradict it, OD-109).
            <p className="mt-2 mb-5 text-muted-foreground tabular-nums">
              {formatMoney(m.spentCents)} spent and {formatMoney(m.committedCents)} planned
              {m.countingPhases.length > 0 ? ` for ${listText(m.countingPhases)}` : ''}, against a{' '}
              {formatMoney(m.poolCents)} budget.{' '}
              <Link
                to="/money"
                className="relative text-foreground underline underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-3"
              >
                See where it goes
              </Link>
            </p>
          ) : (
            <p className="mt-2 mb-5 text-muted-foreground">
              That&apos;s what remains of the {formatMoney(m.poolCents)} budget after everything
              spent
              {m.countingPhases.length > 0 ? ` and planned for ${listText(m.countingPhases)}` : ''}.
            </p>
          )}
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

function NeedsYou({
  items,
  quotes,
  overCents,
}: {
  items: Summary['needsYou'];
  quotes: Summary['expiringQuotes'];
  /** How far planned spending is over the budget; 0 when it isn't (OD-138). */
  overCents: number;
}) {
  const count = items.length + quotes.length + (overCents > 0 ? 1 : 0);
  // Nothing waiting: the greeting says so in one line instead (Q121).
  if (count === 0) return null;
  return (
    <section
      aria-labelledby="needs-you"
      className="min-w-0 flex-[1_1_20rem] rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex items-center gap-2.5">
        <h2 id="needs-you" className="text-2xl">
          Needs you
        </h2>
        {count > 0 ? (
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-tape px-2 font-bold text-tape-ink tabular-nums">
            {count}
          </span>
        ) : null}
      </div>
      <ul className="mt-2 divide-y divide-border">
        {/* Over budget is something to decide on, so it's listed here too: the headline never
            sits above "Nothing needs you" while it's over (OD-138). */}
        {overCents > 0 ? (
          <li className="flex items-start gap-3 py-4 last:pb-0">
            <span className="mt-0.5 inline-flex shrink-0 rounded-lg bg-tape p-1 text-tape-ink">
              <CircleAlert aria-hidden className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">The plans are over budget</p>
              <p className="text-sm text-muted-foreground tabular-nums">
                By {formatMoney(overCents)}. Trim the shopping list or a job, or add money.
              </p>
              <Link
                to="/money"
                className={buttonVariants({ variant: 'outline', className: 'mt-3' })}
              >
                See the money
              </Link>
            </div>
          </li>
        ) : null}
        {items.map((n) => (
          <li key={n.id} className="flex items-start gap-3 py-4 last:pb-0">
            <span className="mt-0.5 inline-flex shrink-0 rounded-lg bg-tape p-1 text-tape-ink">
              <CircleAlert aria-hidden className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{n.jobName}</p>
              <p className="text-sm text-muted-foreground">
                {n.room ? `${n.room.name} is done and ready to check.` : 'Done and ready to check.'}
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
        {quotes.map((q) => (
          <li key={q.id} className="flex items-start gap-3 py-4 last:pb-0">
            <span className="mt-0.5 inline-flex shrink-0 rounded-lg bg-tape p-1 text-tape-ink">
              <CircleAlert aria-hidden className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{q.jobName}</p>
              <p className="text-sm text-muted-foreground">
                {q.vendorName}&apos;s quote
                {q.amountCents !== null ? ` of ${formatMoney(q.amountCents)}` : ''} is good until{' '}
                {q.validUntil && isIsoDate(q.validUntil) ? formatIsoDate(q.validUntil) : 'soon'}.
              </p>
              <Link
                to="/jobs/$jobId"
                params={{ jobId: q.jobId }}
                className={buttonVariants({ variant: 'outline', className: 'mt-3' })}
              >
                See the estimates
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The current phase (OD-116, Q119): a heading that says what its jobs say, the same "done" tape
 * as the Phases list, and only the jobs that are moving. Both "See all" links sit together
 * at the top, like Rooms below.
 */
function PhasePanel({ summary }: { summary: Summary }) {
  const { phase, phaseJobs } = summary;
  const glance = phaseGlance(phaseJobs);
  return (
    <section aria-labelledby="phase" className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="phase" className="text-2xl">
          {phaseHeading(phase, glance)}
        </h2>
        <div className="flex flex-wrap gap-x-4">
          {phaseJobs.length > 0 ? (
            <Link to="/jobs" className={buttonVariants({ variant: 'link', className: 'px-0' })}>
              See all {phaseJobs.length} {phaseJobs.length === 1 ? 'job' : 'jobs'}
            </Link>
          ) : null}
          <Link to="/phases" className={buttonVariants({ variant: 'link', className: 'px-0' })}>
            See all phases
          </Link>
        </div>
      </div>
      {phase == null ? null : phaseJobs.length === 0 ? (
        <p className="mt-3 text-muted-foreground">
          No jobs in {phase.name} yet. Add them on the{' '}
          <Link to="/jobs" className="text-foreground underline underline-offset-4">
            Jobs page
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-1 items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
            {phase.progress.total > 0 ? (
              <TapeStrip
                mode="progress"
                size="sm"
                done={phase.progress.done}
                total={phase.progress.total}
                label={`${phase.name}: ${phaseProgressText(phase.progress)}`}
              />
            ) : null}
            <span className="text-sm text-muted-foreground tabular-nums">
              {phaseProgressText(phase.progress)}
            </span>
          </div>
          <MovingJobs jobs={glance.moving} />
        </>
      )}
    </section>
  );
}

/** Only the jobs that are moving (underway or waiting on someone), OD-92. */
function MovingJobs({ jobs }: { jobs: Summary['phaseJobs'] }) {
  if (jobs.length === 0) {
    return <p className="mt-3 text-muted-foreground">Nothing is underway right now.</p>;
  }
  return (
    <ul className="mt-4 flex flex-col gap-4">
      {jobs.map((j) => {
        const count = progressText(j.progress, j.roomCount);
        return (
          <li
            key={j.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,11rem)]"
          >
            <Link
              to="/jobs/$jobId"
              params={{ jobId: j.id }}
              className="truncate font-semibold underline underline-offset-4 hover:decoration-2"
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
  );
}

/**
 * The rooms (OD-116, Q120): those needing someone first, then work in progress, then the rest.
 * A room with a cover shows it; one without gets a compact tile with no empty placeholder.
 * Names are headings, and each tile has the progress tape the Rooms list uses.
 */
function Rooms({ rooms }: { rooms: Summary['rooms'] }) {
  const trpc = useTRPC();
  // Same covers as the Rooms list (M4, OD-64).
  const covers = useQuery(trpc.files.roomCovers.queryOptions());
  const coverOf = new Map((covers.data ?? []).map((c) => [c.roomId, c.url]));
  const shown = homeRoomOrder(rooms).slice(0, HOME_ROOMS);
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
          {shown.map((r) => {
            const cover = coverOf.get(r.id);
            const progress = roomProgressText(r.progress);
            return (
              <li key={r.id} className="min-w-0">
                <Link
                  to="/rooms/$roomId"
                  params={{ roomId: r.id }}
                  className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card hover:border-input"
                >
                  {cover ? (
                    <img
                      src={cover}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-24 w-full bg-inset object-cover sm:h-32"
                    />
                  ) : null}
                  <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
                    <h3 className="text-xl font-semibold break-words">{r.name}</h3>
                    {r.awaitingReview ? (
                      <span>
                        <StatusBadge status="awaiting_review" />
                      </span>
                    ) : (
                      <p className="text-sm text-muted-foreground tabular-nums">{progress}</p>
                    )}
                    {r.progress.total > 0 ? (
                      <TapeStrip
                        mode="progress"
                        size="sm"
                        done={r.progress.done}
                        total={r.progress.total}
                        label={`${r.name}: ${progress}`}
                        className="mt-auto pt-2"
                      />
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
