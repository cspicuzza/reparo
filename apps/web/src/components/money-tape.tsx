import { BudgetTapeStrip } from '@/components/tape';
import { WhatsThis } from '@/components/whats-this';
import { money, moneyStep, shortMoney } from '@/lib/money';
import { budgetSegments, COMMITTED_STRIPES, LEFT_SWATCH, moneyTicks } from '@/lib/tape';
import { cn } from '@/lib/utils';

const SWATCH =
  'mr-2 inline-block size-3.5 rounded-sm align-[-2px] outline-1 outline-solid outline-tape-edge';

/**
 * The budget as a tape measure (canvas section D): a dollar scale above, the strip filled for
 * what's spent (solid) and planned (striped), plaster for what's left, and a legend that says
 * the same in words. Over budget, the scale runs to everything spent and planned, the
 * budget's end is marked and labelled, and the overrun is red (OD-109, Q115–Q116). Every number
 * comes from `money.summary`. Phones show only the labels that matter, so they don't collide.
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
  const seg = budgetSegments(spentCents, committedCents, poolCents);
  const step = moneyStep(seg.scaleCents);
  const over = seg.over > 0;
  // Over budget, the budget's own label takes the space before its mark (or after it, when
  // the mark is near the start), so scale labels there give way.
  const clear = (at: number) =>
    seg.budgetAt < 0.3
      ? at < seg.budgetAt - 0.05 || at > seg.budgetAt + 0.25
      : at < seg.budgetAt - 0.25 || at > seg.budgetAt + 0.05;
  const majors = moneyTicks(seg.scaleCents, step).filter((t) => t.major && (!over || clear(t.at)));
  const marks = compact ? [] : majors;
  return (
    <div>
      {poolCents > 0 ? (
        <div
          aria-hidden="true"
          className="relative mb-1 h-5 text-sm whitespace-nowrap text-muted-foreground tabular-nums"
        >
          {/* Way over budget, the budget label sits near the start; $0 gives way to it. */}
          {over && seg.budgetAt < 0.3 ? null : <span className="absolute left-0">$0</span>}
          {marks.map((t) => (
            <span
              key={t.at}
              className="absolute hidden -translate-x-1/2 sm:inline"
              style={{ left: `${t.at * 100}%` }}
            >
              {shortMoney(Math.round(t.at * seg.scaleCents))}
            </span>
          ))}
          {over ? (
            // Ends at the budget's mark; the far end needs no label, the legend says by how much.
            <span
              className={cn(
                'absolute font-semibold text-foreground',
                seg.budgetAt < 0.3 ? 'pl-1' : '-translate-x-full pr-1',
              )}
              style={{ left: `${seg.budgetAt * 100}%` }}
            >
              Budget {shortMoney(poolCents)}
            </span>
          ) : (
            <span className="absolute right-0">{shortMoney(poolCents)}</span>
          )}
        </div>
      ) : null}
      <BudgetTapeStrip
        segments={seg}
        stepCents={step}
        label={
          availableCents < 0
            ? `Of the ${money(poolCents)} budget, ${money(spentCents)} is spent and ${money(committedCents)} planned: ${money(-availableCents)} over`
            : `Of the ${money(poolCents)} budget, ${money(spentCents)} is spent, ${money(committedCents)} planned and ${money(availableCents)} left`
        }
      />
      <div
        className={cn(
          'mt-3 flex flex-wrap gap-x-5 gap-y-1 tabular-nums',
          compact ? 'text-sm' : 'text-base',
        )}
      >
        <span>
          <span aria-hidden="true" className={cn(SWATCH, 'bg-tape-fill')} />
          Spent <strong className="font-semibold">{money(spentCents)}</strong>
        </span>
        <span>
          <span aria-hidden="true" className={SWATCH} style={COMMITTED_STRIPES} />
          Planned <strong className="font-semibold">{money(committedCents)}</strong>{' '}
          <WhatsThis title="Planned">
            What jobs still cost and what&apos;s still to buy, in phases that have started. It
            becomes Spent as it&apos;s paid for. Planned phases don&apos;t count until they start.
          </WhatsThis>
        </span>
        {availableCents < 0 ? (
          <span>
            <span aria-hidden="true" className={cn(SWATCH, 'bg-destructive')} />
            Over budget by{' '}
            <strong className="font-semibold text-destructive">{money(-availableCents)}</strong>
          </span>
        ) : (
          <span>
            <span aria-hidden="true" className={SWATCH} style={LEFT_SWATCH} />
            Left to spend <strong className="font-semibold">{money(availableCents)}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
