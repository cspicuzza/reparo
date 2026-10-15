import { jobRoomUpdateSchema } from '@reparo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { AutoSaveField } from '@/components/auto-save-field';
import { Button } from '@/components/ui/button';
import { useFocusFirstField } from '@/lib/editor-focus';
import { problemWith } from '@/lib/problem';
import { trpcClient, useTRPC } from '@/lib/trpc';

/**
 * One room's own spec and notes on a job. A blank spec means "same as the job" — the room
 * then follows the job's spec, including later edits to it. Each field saves when you leave it
 * (Workflow polish, OD-77); Done only closes the editor.
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
  const ref = useFocusFirstField<HTMLDivElement>();
  const save = (input: { spec?: string; notes?: string }) =>
    trpcClient.jobRooms.update
      .mutate({ id: jobRoom.id, ...input })
      .then(() => queryClient.invalidateQueries(trpc.jobs.pathFilter()));
  const id = (f: string) => `${idPrefix}-${f}`;

  return (
    <div ref={ref} className="grid gap-4">
      <AutoSaveField
        id={id('spec')}
        label={`Spec for ${roomName}`}
        hint={
          jobSpec
            ? `Leave blank to use the job's spec: “${jobSpec.split('\n')[0] ?? ''}”`
            : "Leave blank to use the job's spec."
        }
        initial={jobRoom.spec ?? ''}
        multiline
        what={`Spec for ${roomName}`}
        validate={(v) => problemWith(jobRoomUpdateSchema.shape.spec, v)}
        onSave={(v) => save({ spec: v })}
      />
      <AutoSaveField
        id={id('notes')}
        label="Notes"
        initial={jobRoom.notes}
        multiline
        rows={2}
        what={`Notes for ${roomName}`}
        validate={(v) => problemWith(jobRoomUpdateSchema.shape.notes, v)}
        onSave={(v) => save({ notes: v })}
      />
      <div>
        <Button type="button" variant="outline" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
