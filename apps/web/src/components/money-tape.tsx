import { TapeStrip } from '@/components/tape';
import { money, moneyStep, shortMoney } from '@/lib/money';
import { moneyTicks } from '@/lib/tape';
import { cn } from '@/lib/utils';

/**
 * The budget as a tape measure (canvas section D): a dollar scale above, the strip filled dark
 * for what's spent or committed and yellow for what's left, and a legend that says the same in
 * words. Every number comes from `money.summary`. Phones show only the ends of the scale, so the
 * labels don't run into each other.
 */
export function MoneyTape({
  poolCents,
  spentCents,
  committedCents,
  availableCents,
  compact = false,
}: {
  poolCents: number;
  spentCents: number;
  committedCents: number;
  availableCents: number;
  compact?: boolean;
}) {
  const used = spentCents + committedCents;
  const step = moneyStep(poolCents);
  const majors = moneyTicks(poolCents, step).filter((t) => t.major);
  const marks = compact ? [] : majors;
  const over = availableCents < 0;
  return (
    <div>
      {poolCents > 0 ? (
        <div
          aria-hidden="true"
          className="relative mb-1 h-5 text-sm text-muted-foreground tabular-nums"
        >
          <span className="absolute left-0">$0</span>
          {marks.map((t) => (
            <span
              key={t.at}
              className="absolute hidden -translate-x-1/2 sm:inline"
              style={{ left: `${t.at * 100}%` }}
            >
              {shortMoney(Math.round(t.at * poolCents))}
            </span>
          ))}
          <span className="absolute right-0">{shortMoney(poolCents)}</span>
        </div>
      ) : null}
      <TapeStrip
        mode="money"
        usedCents={used}
        totalCents={poolCents}
        stepCents={step}
        label={
          over
            ? `Of the ${money(poolCents)} budget, ${money(used)} is spent or committed: ${money(-availableCents)} over`
            : `Of the ${money(poolCents)} budget, ${money(used)} is spent or committed and ${money(availableCents)} is left`
        }
      />
      <div
        className={cn(
          'mt-3 flex flex-wrap gap-x-5 gap-y-1 tabular-nums',
          compact ? 'text-sm' : 'text-base',
        )}
      >
        <span>
          <span
            aria-hidden="true"
            className="mr-2 inline-block size-3.5 rounded-sm bg-tape-ink align-[-2px] outline-1 outline-solid outline-tape-edge"
          />
          Spent and committed <strong className="font-semibold">{money(used)}</strong>
        </span>
        <span>
          <span
            aria-hidden="true"
            className="mr-2 inline-block size-3.5 rounded-sm bg-tape align-[-2px] outline-1 outline-solid outline-tape-edge"
          />
          {over ? (
            <>
              Over by{' '}
              <strong className="font-semibold text-destructive">{money(-availableCents)}</strong>
            </>
          ) : (
            <>
              Left to spend <strong className="font-semibold">{money(availableCents)}</strong>
            </>
          )}
        </span>
        {compact ? null : (
          <span className="text-muted-foreground">Spent so far {money(spentCents)}</span>
        )}
      </div>
    </div>
  );
}
