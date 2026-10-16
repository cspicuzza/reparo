import { Button } from '@/components/ui/button';

/**
 * Move up / Move down for one row of a list that's being put in order (OD-117, Q141), instead
 * of typing an order number. After a move the list redraws, so focus is put back on the button
 * that was pressed (or its partner, once the row reaches an end) by its id.
 */
export function MoveButtons({
  id,
  name,
  index,
  count,
  disabled,
  onMove,
}: {
  /** Used for the buttons' ids, so focus can find them again after the list redraws. */
  id: string;
  name: string;
  index: number;
  count: number;
  disabled?: boolean;
  onMove: (by: -1 | 1) => Promise<unknown>;
}) {
  const move = async (by: -1 | 1) => {
    await onMove(by);
    const landed = index + by;
    const same = (by === -1 ? landed > 0 : landed < count - 1) ? by : -by;
    requestAnimationFrame(() =>
      document.getElementById(`move-${id}-${same === -1 ? 'up' : 'down'}`)?.focus(),
    );
  };
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Button
        id={`move-${id}-up`}
        type="button"
        variant="outline"
        disabled={disabled || index === 0}
        onClick={() => void move(-1)}
      >
        Move up
        <span className="sr-only"> {name}</span>
      </Button>
      <Button
        id={`move-${id}-down`}
        type="button"
        variant="outline"
        disabled={disabled || index === count - 1}
        onClick={() => void move(1)}
      >
        Move down
        <span className="sr-only"> {name}</span>
      </Button>
    </span>
  );
}
