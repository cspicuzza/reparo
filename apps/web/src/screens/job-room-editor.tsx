import { zodResolver } from '@hookform/resolvers/zod';
import { jobRoomFormSchema, type JobRoomForm, type JobRoomFormInput } from '@reparo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Field, primaryButtonClass, quietButtonClass, Textarea } from '@/components/form';
import { useTRPC } from '@/lib/trpc';

/**
 * One room's own spec and notes on a job. A blank spec means "same as the job" — the room
 * then follows the job's spec, including later edits to it.
 */
export function JobRoomEditor({
  idPrefix,
  jobRoom,
  jobSpec,
  roomName,
  onDone,
}: {
  idPrefix: string;
  jobRoom: { id: string; spec: string | null; notes: string };
  jobSpec: string;
  roomName: string;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const update = useMutation(
    trpc.jobRooms.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.jobs.pathFilter());
        onDone();
      },
    }),
  );
  const { register, handleSubmit, formState } = useForm<JobRoomFormInput, unknown, JobRoomForm>({
    resolver: zodResolver(jobRoomFormSchema),
    defaultValues: { spec: jobRoom.spec ?? '', notes: jobRoom.notes },
  });
  const id = (f: string) => `${idPrefix}-${f}`;

  return (
    <form
      onSubmit={(e) =>
        void handleSubmit(async (values) => {
          await update.mutateAsync({ id: jobRoom.id, ...values }).catch(() => undefined);
        })(e)
      }
      className="grid gap-4"
    >
      <Field
        label={`Spec for ${roomName}`}
        htmlFor={id('spec')}
        hint={
          jobSpec
            ? `Leave blank to use the job's spec: “${jobSpec.split('\n')[0] ?? ''}”`
            : "Leave blank to use the job's spec."
        }
        error={formState.errors.spec?.message}
      >
        <Textarea id={id('spec')} rows={3} {...register('spec')} />
      </Field>
      <Field label="Notes" htmlFor={id('notes')} error={formState.errors.notes?.message}>
        <Textarea id={id('notes')} rows={2} {...register('notes')} />
      </Field>
      {update.error ? (
        <p role="alert" className="text-sm">
          {update.error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={formState.isSubmitting} className={primaryButtonClass}>
          Save
        </button>
        <button type="button" onClick={onDone} className={quietButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}
