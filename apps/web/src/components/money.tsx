import type { EstimateStatusInput, ShoppingStatusInput } from '@reparo/shared';
import { Circle, CircleCheck, CircleSlash, Contrast } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ESTIMATE_STATUS_LABEL,
  paymentText,
  SHOPPING_STATUS_LABEL,
  type PaymentStatus,
} from '@/lib/money';
import { cn } from '@/lib/utils';

type Look = {
  icon: LucideIcon;
  bg: string;
  fg: string;
};

// Idle tints match the row hover color, so they carry a faint ring of their own text color
// to stay visible on a hovered row (OD-114, Q150).
const RING = 'ring-1 ring-inset ring-current/25';
const IDLE: Look = { icon: Circle, bg: cn('bg-status-idle-tint', RING), fg: 'text-status-idle' };
const PROGRESS: Look = {
  icon: Contrast,
  bg: 'bg-status-progress-tint',
  fg: 'text-status-progress',
};
/**
 * Paid in full, Chosen, Purchased: settled, but not "done" work, so not the Completed green,
 * which is for work and saves only (OD-114, Q130).
 */
const SETTLED: Look = { icon: CircleCheck, bg: cn('bg-inset', RING), fg: 'text-foreground' };
const OFF: Look = {
  icon: CircleSlash,
  bg: cn('bg-status-idle-tint', RING),
  fg: 'text-status-idle',
};

/** A chip in the same shape as the work-status chips: icon, words, tint (color never alone). */
function Chip({ look, children }: { look: Look; children: string }) {
  const { icon: Icon, bg, fg } = look;
  return (
    <span
      className={cn(
        'inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold whitespace-nowrap',
        bg,
        fg,
      )}
    >
      <Icon aria-hidden absoluteStrokeWidth strokeWidth={2} className="size-4 shrink-0" />
      {children}
    </span>
  );
}

/** Unpaid / Deposit paid (with %) / Paid in full. Nothing yellow: paying isn't a "needs you". */
export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const look = status.kind === 'paid' ? SETTLED : status.kind === 'deposit' ? PROGRESS : IDLE;
  return <Chip look={look}>{paymentText(status)}</Chip>;
}

export function ShoppingStatusBadge({ status }: { status: ShoppingStatusInput }) {
  const look = status === 'purchased' ? SETTLED : status === 'returned' ? OFF : IDLE;
  return <Chip look={look}>{SHOPPING_STATUS_LABEL[status]}</Chip>;
}

/** Requested / Received / Chosen / Declined (M4). */
export function EstimateStatusBadge({ status }: { status: EstimateStatusInput }) {
  const look =
    status === 'chosen'
      ? SETTLED
      : status === 'declined'
        ? OFF
        : status === 'received'
          ? PROGRESS
          : IDLE;
  return <Chip look={look}>{ESTIMATE_STATUS_LABEL[status]}</Chip>;
}
