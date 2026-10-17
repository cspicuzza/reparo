import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { FileSection } from '@/components/file-section';
import { Select } from '@/components/form';
import { Panel } from '@/components/panel';
import { useTRPC } from '@/lib/trpc';
import type { FileView } from '@/lib/upload';

type DrawingKind = 'mockup' | 'spec_drawing';

/**
 * A job's files (M4, OD-58; Q17, Q19): Drawings (mockups and spec drawings), Paperwork
 * (contract, permit, invoices, lien waivers) and the progress photos that show this job, which
 * are added on each room's page.
 */
export function JobFiles({ jobId, canEdit }: { jobId: string; canEdit: boolean }) {
  const trpc = useTRPC();
  const files = useQuery(trpc.files.list.queryOptions({ ownerType: 'job', ownerId: jobId }));
  const photos = useQuery(trpc.files.forJob.queryOptions({ jobId }));
  const [drawingKind, setDrawingKind] = useState<DrawingKind>('mockup');
  const kindId = useId();

  const all = files.data ?? [];
  // On the job page a progress photo says which room it's in, not which job.
  const progress: FileView[] = (photos.data ?? []).map((p) => ({ ...p, jobName: p.roomName }));

  return (
    <Panel aria-labelledby="job-files">
      <h2 id="job-files" className="text-2xl">
        Drawings and paperwork
      </h2>
      <div className="mt-4 flex flex-col gap-6">
        <FileSection
          id="drawings"
          title="Drawings"
          files={all.filter((f) => f.kind === 'mockup' || f.kind === 'spec_drawing')}
          target={() => ({ ownerType: 'job', ownerId: jobId, kind: drawingKind })}
          uploadLabel="Add drawings"
          emptyText="No drawings yet"
          canEdit={canEdit}
          source={files}
          emptyLine
          emptyUploads={[
            {
              label: 'Add mockups',
              target: () => ({ ownerType: 'job', ownerId: jobId, kind: 'mockup' }),
            },
            {
              label: 'Add spec drawings',
              target: () => ({ ownerType: 'job', ownerId: jobId, kind: 'spec_drawing' }),
            },
          ]}
          beforeUpload={
            <div className="sm:max-w-xs">
              <label htmlFor={kindId} className="block text-sm font-semibold">
                The new drawings are
              </label>
              <Select
                id={kindId}
                className="mt-1.5"
                value={drawingKind}
                onChange={(e) => setDrawingKind(e.target.value as DrawingKind)}
              >
                <option value="mockup">Mockups</option>
                <option value="spec_drawing">Spec drawings</option>
              </Select>
            </div>
          }
          badge={(f) => (
            <span className="rounded-lg bg-card px-2 py-0.5 text-sm font-semibold text-foreground shadow-knob">
              {f.kind === 'mockup' ? 'Mockup' : 'Spec drawing'}
            </span>
          )}
        />
        <FileSection
          id="paperwork"
          title="Paperwork"
          description="Add a caption to say which is which."
          files={all.filter((f) => f.kind === 'paperwork')}
          target={() => ({ ownerType: 'job', ownerId: jobId, kind: 'paperwork' })}
          uploadLabel="Add paperwork"
          emptyText="No paperwork yet"
          canEdit={canEdit}
          source={files}
          emptyLine
        />
        <FileSection
          id="job-progress-photos"
          title="Progress photos"
          description="Photos from the room pages that show this job."
          files={progress}
          emptyText="None yet. Add them on a room's page."
          canEdit={canEdit}
          source={photos}
          emptyLine
        />
      </div>
    </Panel>
  );
}
