import { WORK_STATUSES, type WorkStatusInput } from '@reparo/shared';
import { Circle, CircleAlert, CircleCheck, CircleSlash, Contrast } from 'lucide-react';
import type { ComponentType } from 'react';
import { WORK_STATUS_LABEL } from '@/lib/work';
import { cn } from '@/lib/utils';

/**
 * Job status styles (Linear → Design system → Job status styles): an icon, the word and a tint,
 * so colour never carries the meaning alone. Awaiting review is the tape yellow — the "someone
 * needs to look" state. Cancelled is muted, never struck through, so it stays readable.
 */
const STATUS: Record<
  WorkStatusInput,
  { icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>; bg: string; fg: string }
> = {
  unstarted: { icon: Circle, bg: 'bg-status-idle-tint', fg: 'text-status-idle' },
  in_progress: { icon: Contrast, bg: 'bg-status-progress-tint', fg: 'text-status-progress' },
  awaiting_review: { icon: CircleAlert, bg: 'bg-tape', fg: 'text-tape-ink' },
  completed: { icon: CircleCheck, bg: 'bg-status-done-tint', fg: 'text-status-done' },
  cancelled: { icon: CircleSlash, bg: 'bg-status-idle-tint', fg: 'text-status-idle' },
};

/** The status as a chip: icon, word, tint. */
export function StatusBadge({ status }: { status: WorkStatusInput }) {
  const { icon: Icon, bg, fg } = STATUS[status];
  return (
    <span
      className={cn(
        'inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold whitespace-nowrap',
        bg,
        fg,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {WORK_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Status as a dropdown that saves the moment a new one is picked (Chris, 2026-10-14: no
 * Edit → Save just to mark a room done). `label` names what it's for, for screen readers.
 * A native select, so it works the same with touch, mouse, keyboard and screen readers.
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
  const { icon: Icon, bg, fg } = STATUS[value];
  return (
    <span className="relative inline-flex items-center">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Icon aria-hidden className={cn('pointer-events-none absolute left-3 size-5', fg)} />
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as WorkStatusInput)}
        className={cn(
          'min-h-11 rounded-lg border border-input pr-3 pl-10 text-base font-semibold disabled:opacity-50',
          bg,
          fg,
        )}
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
