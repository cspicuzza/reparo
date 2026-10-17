import { TapeStrip } from '@/components/tape';
import { money, moneyStep } from '@/lib/money';
import { LEFT_SWATCH } from '@/lib/tape';
import { cn } from '@/lib/utils';

const SWATCH =
  'mr-2 inline-block size-3.5 rounded-sm align-[-2px] outline-1 outline-tape-edge outline-solid';

/**
 * What's bought against what's left to buy, drawn as the tape measure (OD-107, Q104): the
 * fill is what's been paid (returns count what wasn't refunded), the plaster track the price of
 * what's still to buy (OD-138). The amounts are written beside it, so the colors never carry them alone. Used
 * on Shopping (following its filters) and on a room's page (OD-118, Q143). Nothing to show
 * when there's nothing priced.
 */
export function BoughtTape({
  boughtCents,
  leftCents,
  className,
}: {
  boughtCents: number;
  leftCents: number;
  className?: string;
}) {
  const totalCents = boughtCents + leftCents;
  if (totalCents <= 0) return null;
  return (
    <div className={className}>
      <TapeStrip
        mode="money"
        usedCents={boughtCents}
        totalCents={totalCents}
        stepCents={moneyStep(totalCents)}
        label={`${money(boughtCents)} bought and ${money(leftCents)} left to buy, of ${money(totalCents)}`}
      />
      <div aria-hidden className="mt-3 flex flex-wrap gap-x-5 gap-y-1 tabular-nums">
        <span>
          <span className={cn(SWATCH, 'bg-tape-fill')} />
          Bought <strong className="font-semibold">{money(boughtCents)}</strong>
        </span>
        <span>
          <span className={SWATCH} style={LEFT_SWATCH} />
          Left to buy <strong className="font-semibold">{money(leftCents)}</strong>
        </span>
      </div>
    </div>
  );
}
