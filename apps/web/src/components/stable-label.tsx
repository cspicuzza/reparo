/**
 * A button label that swaps between two wordings ("Change order" and "Done") without the
 * button changing width (OD-145): both sit in one grid cell, and the one not in use is hidden,
 * from screen readers too.
 */
export function StableLabel({
  on,
  onLabel,
  offLabel,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <span className="grid">
      <span className={on ? 'invisible col-start-1 row-start-1' : 'col-start-1 row-start-1'}>
        {offLabel}
      </span>
      <span className={on ? 'col-start-1 row-start-1' : 'invisible col-start-1 row-start-1'}>
        {onLabel}
      </span>
    </span>
  );
}
