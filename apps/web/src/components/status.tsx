import type { WorkStatusInput } from '@reparo/shared';
import { WORK_STATUS_LABEL } from '@/lib/work';

const tone: Record<WorkStatusInput, string> = {
  unstarted: 'border-chalk text-pencil',
  in_progress: 'border-moss text-moss-deep',
  awaiting_review: 'border-ink text-ink',
  completed: 'border-moss bg-moss text-paper',
  cancelled: 'border-chalk text-pencil line-through decoration-chalk',
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
