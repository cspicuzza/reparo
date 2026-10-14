import { WORK_STATUSES, type WorkStatusInput } from '@reparo/shared';
import { WORK_STATUS_LABEL } from '@/lib/work';

/**
 * Plaster and tape status colours (Linear → Design system → Job status styles). Awaiting review
 * is the tape yellow: it's the "someone needs to look" state. Icons and the new chip shape come
 * with the screen restyle; this keeps the current shapes.
 */
const tone: Record<WorkStatusInput, string> = {
  unstarted: 'border-transparent bg-status-idle-tint text-status-idle',
  in_progress: 'border-transparent bg-status-progress-tint text-status-progress',
  awaiting_review: 'border-transparent bg-tape text-tape-ink',
  completed: 'border-transparent bg-status-done-tint text-status-done',
  cancelled:
    'border-transparent bg-status-idle-tint text-status-idle line-through decoration-status-idle',
};

/** The dropdown adds the field border so its edge stays visible (≥ 3:1) on any fill. */
const selectTone: Record<WorkStatusInput, string> = {
  unstarted: 'border-input bg-status-idle-tint text-status-idle',
  in_progress: 'border-input bg-status-progress-tint text-status-progress',
  awaiting_review: 'border-input bg-tape text-tape-ink',
  completed: 'border-input bg-status-done-tint text-status-done',
  cancelled:
    'border-input bg-status-idle-tint text-status-idle line-through decoration-status-idle',
};

/** A small outlined status word. Colour never carries the meaning alone — the word does. */
export function StatusBadge({ status }: { status: WorkStatusInput }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tone[status]}`}
    >
      {WORK_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Status as a dropdown that saves the moment a new one is picked (Chris, 2026-10-14: no
 * Edit → Save just to mark a room done). `label` names what it's for, for screen readers.
 */
export function StatusSelect({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: WorkStatusInput;
  disabled?: boolean;
  onChange: (status: WorkStatusInput) => void;
}) {
  return (
    <span className="inline-flex items-center">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as WorkStatusInput)}
        className={`min-h-11 rounded-full border px-3 text-sm font-medium focus:outline-none disabled:opacity-50 ${selectTone[value]}`}
      >
        {WORK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {WORK_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </span>
  );
}
