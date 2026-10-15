import { UnsavedGuard } from '@/components/unsaved-guard';
import { useFocusFirstField } from '@/lib/editor-focus';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  formatLength,
  roomCreateSchema,
  type RoomCreate,
  type RoomCreateInput,
} from '@reparo/shared';
import { useForm } from 'react-hook-form';
import { Field, FormError, Input, Textarea } from '@/components/form';

import type { Room } from '@/lib/rooms';
import { Button } from '@/components/ui/button';

type Input_ = RoomCreateInput;
type RoomValues = RoomCreate;

const lengthHint = `Feet and inches, like 14' 6 1/2", or plain inches, like 174.5.`;

/** Turn a stored room into what the inputs show: lengths as feet-inches text, empty if unmeasured. */
function toDefaults(room?: Room): Input_ {
  return {
    name: room?.name ?? '',
    lengthIn: room?.lengthIn == null ? '' : formatLength(room.lengthIn),
    widthIn: room?.widthIn == null ? '' : formatLength(room.widthIn),
    ceilingHeightIn: room?.ceilingHeightIn == null ? '' : formatLength(room.ceilingHeightIn),
    notes: room?.notes ?? '',
    sortOrder: room?.sortOrder ?? 0,
  };
}

type Props = {
  room?: Room;
  onSubmit: (values: RoomValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
  /** Server-side problem (a duplicate name, say) shown under the form. */
  serverError?: string | undefined;
  idPrefix: string;
};

/** One form for adding and editing a room; validation is the same Zod schema the API uses. */
export function RoomForm({ room, onSubmit, onCancel, submitLabel, serverError, idPrefix }: Props) {
  const form = useForm<Input_, unknown, RoomValues>({
    resolver: zodResolver(roomCreateSchema),
    defaultValues: toDefaults(room),
  });
  const { register, handleSubmit, formState } = form;
  const errors = formState.errors;
  const id = (f: string) => `${idPrefix}-${f}`;

  const formRef = useFocusFirstField<HTMLFormElement>();
  return (
    <form
      ref={formRef}
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      className="grid gap-5"
      aria-describedby={serverError ? id('server-error') : undefined}
    >
      <Field label="Name" htmlFor={id('name')} error={errors.name?.message}>
        <Input id={id('name')} autoComplete="off" {...register('name')} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Length" htmlFor={id('length')} error={errors.lengthIn?.message}>
          <Input
            id={id('length')}
            inputMode="text"
            placeholder={`14' 6"`}
            {...register('lengthIn')}
          />
        </Field>
        <Field label="Width" htmlFor={id('width')} error={errors.widthIn?.message}>
          <Input id={id('width')} inputMode="text" placeholder={`12'`} {...register('widthIn')} />
        </Field>
        <Field
          label="Ceiling height"
          htmlFor={id('ceiling')}
          error={errors.ceilingHeightIn?.message}
        >
          <Input
            id={id('ceiling')}
            inputMode="text"
            placeholder={`9'`}
            {...register('ceilingHeightIn')}
          />
        </Field>
      </div>
      {/* Hidden while a length has a problem: its message already says how to write it. */}
      {errors.lengthIn || errors.widthIn || errors.ceilingHeightIn ? null : (
        <p className="-mt-3 text-sm text-muted-foreground">{lengthHint}</p>
      )}

      <Field label="Notes" htmlFor={id('notes')} error={errors.notes?.message}>
        <Textarea id={id('notes')} rows={3} {...register('notes')} />
      </Field>

      <Field
        label="Order"
        htmlFor={id('order')}
        hint="Lower comes first in the list"
        error={errors.sortOrder?.message}
      >
        <Input
          id={id('order')}
          type="number"
          min={0}
          step={1}
          className="sm:w-32"
          {...register('sortOrder', { valueAsNumber: true })}
        />
      </Field>

      {serverError ? <FormError id={id('server-error')}>{serverError}</FormError> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={formState.isSubmitting}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" onClick={onCancel} variant="ghost">
            Cancel
          </Button>
        ) : null}
      </div>
      <UnsavedGuard
        when={formState.isDirty && !formState.isSubmitting && !formState.isSubmitSuccessful}
      />
    </form>
  );
}
