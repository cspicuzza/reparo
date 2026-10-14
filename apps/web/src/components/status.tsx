import { WORK_STATUSES, type WorkStatusInput } from '@reparo/shared';
import { WORK_STATUS_LABEL } from '@/lib/work';

const tone: Record<WorkStatusInput, string> = {
  unstarted: 'border-chalk text-pencil',
  in_progress: 'border-moss text-moss-deep',
  awaiting_review: 'border-ink text-ink',
  completed: 'border-moss bg-moss text-paper',
  cancelled: 'border-chalk text-pencil line-through decoration-chalk',
};

/** The dropdown's own fill: `bg-paper` except Completed, which is solid (no class conflict). */
const selectTone: Record<WorkStatusInput, string> = {
  unstarted: 'border-chalk bg-paper text-pencil',
  in_progress: 'border-moss bg-paper text-moss-deep',
  awaiting_review: 'border-ink bg-paper text-ink',
  completed: 'border-moss bg-moss text-paper',
  cancelled: 'border-chalk bg-paper text-pencil line-through decoration-chalk',
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
