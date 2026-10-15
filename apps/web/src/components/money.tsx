import type { ShoppingStatusInput } from '@reparo/shared';
import { Circle, CircleCheck, CircleSlash, Contrast } from 'lucide-react';
import type { ComponentType } from 'react';
import { paymentText, SHOPPING_STATUS_LABEL, type PaymentStatus } from '@/lib/money';
import { cn } from '@/lib/utils';

type Look = {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  bg: string;
  fg: string;
};

const IDLE: Look = { icon: Circle, bg: 'bg-status-idle-tint', fg: 'text-status-idle' };
const PROGRESS: Look = {
  icon: Contrast,
  bg: 'bg-status-progress-tint',
  fg: 'text-status-progress',
};
const DONE: Look = { icon: CircleCheck, bg: 'bg-status-done-tint', fg: 'text-status-done' };
const OFF: Look = { icon: CircleSlash, bg: 'bg-status-idle-tint', fg: 'text-status-idle' };

/** A chip in the same shape as the work-status chips: icon, words, tint (colour never alone). */
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
      <Icon aria-hidden className="size-4 shrink-0" />
      {children}
    </span>
  );
}

/** Unpaid / Deposit paid (with %) / Paid in full. Nothing yellow: paying isn't a "needs you". */
export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const look = status.kind === 'paid' ? DONE : status.kind === 'deposit' ? PROGRESS : IDLE;
  return <Chip look={look}>{paymentText(status)}</Chip>;
}

export function ShoppingStatusBadge({ status }: { status: ShoppingStatusInput }) {
  const look = status === 'purchased' ? DONE : status === 'returned' ? OFF : IDLE;
  return <Chip look={look}>{SHOPPING_STATUS_LABEL[status]}</Chip>;
}
