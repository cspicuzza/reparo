import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormError } from '@/components/form';
import { LoadError } from '@/components/load-error';
import { Panel } from '@/components/panel';
import { LinesPlaceholder } from '@/components/placeholder';
import { Button } from '@/components/ui/button';
import { trpcClient, useTRPC } from '@/lib/trpc';
import { sendThumbnail } from '@/lib/upload';
import { TINY_LONGEST } from '@/lib/thumbnail';

type Run = { done: number; failed: number; total: number; running: boolean };

/** How many pictures are worked on at once: quick, without flooding a phone's connection. */
const AT_ONCE = 3;

/**
 * Thumbnails for pictures from before them (OD-115, Q170), and the 160px copies for pictures
 * from before those (OD-141): the admin's browser fetches each original, makes the small JPEGs
 * it's missing and sends them, the same way new uploads do. Storage allows the
 * browser to read the originals for this (checked in Chrome, 2026-10-16). Until a picture has
 * one, lists show the original.
 */
export function ThumbnailsAdmin() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const waiting = useQuery(trpc.files.withoutThumbs.queryOptions());
  const [run, setRun] = useState<Run | null>(null);

  async function makeAll() {
    const pictures = (waiting.data ?? []).filter((f) => f.url);
    const progress: Run = { done: 0, failed: 0, total: pictures.length, running: true };
    setRun({ ...progress });
    let next = 0;
    const one = async () => {
      while (next < pictures.length) {
        const f = pictures[next++];
        if (!f?.url) continue;
        let ok = false;
        try {
          const original = await fetch(f.url).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.blob();
          });
          // Only the copies this picture is missing get a link (OD-141).
          const link = await trpcClient.files.thumbLink.mutate({ id: f.id });
          const [thumb, tiny] = await Promise.all([
            link.uploadUrl ? sendThumbnail(original, link.uploadUrl) : false,
            link.tinyUploadUrl ? sendThumbnail(original, link.tinyUploadUrl, TINY_LONGEST) : false,
          ]);
          if ((thumb && link.thumbPath) || (tiny && link.tinyPath)) {
            await trpcClient.files.setThumb.mutate({
              id: f.id,
              ...(thumb && link.thumbPath ? { thumbPath: link.thumbPath } : {}),
              ...(tiny && link.tinyPath ? { tinyPath: link.tinyPath } : {}),
            });
            ok = true;
          }
        } catch {
          ok = false;
        }
        if (ok) progress.done += 1;
        else progress.failed += 1;
        setRun({ ...progress });
      }
    };
    await Promise.all(Array.from({ length: AT_ONCE }, one));
    progress.running = false;
    setRun({ ...progress });
    await queryClient.invalidateQueries({ queryKey: trpc.files.pathKey() });
  }

  const count = waiting.data?.length ?? 0;
  return (
    <Panel aria-labelledby="thumbnails">
      <h2 id="thumbnails" className="text-2xl">
        Picture thumbnails
      </h2>
      <p className="mt-1 max-w-prose text-muted-foreground">
        Lists show small copies of pictures so pages load quickly. Pictures added before that load
        at full size until they get one. Making them runs in this browser; keep the page open until
        it finishes.
      </p>
      <div className="mt-4 flex flex-col items-start gap-3" aria-live="polite">
        {waiting.isPending ? <LinesPlaceholder label="Counting pictures" lines={1} /> : null}
        {waiting.error ? (
          <LoadError what="the pictures" error={waiting.error} retry={[waiting]} />
        ) : null}
        {run ? (
          <p className="tabular-nums">
            {run.running
              ? `Made ${run.done} of ${run.total}…`
              : `Made ${run.done} ${run.done === 1 ? 'thumbnail' : 'thumbnails'}.`}
          </p>
        ) : null}
        {run && !run.running && run.failed > 0 ? (
          <FormError className="mt-0">
            {run.failed} {run.failed === 1 ? 'picture' : 'pictures'} couldn&apos;t be done. Try
            again to retry {run.failed === 1 ? 'it' : 'them'}.
          </FormError>
        ) : null}
        {waiting.data && count === 0 && !run?.running ? (
          <p className="text-muted-foreground">Every picture has its thumbnail.</p>
        ) : null}
        {waiting.data && count > 0 && !run?.running ? (
          <Button type="button" variant="outline" onClick={() => void makeAll()}>
            {run?.failed
              ? 'Try again'
              : `Make ${count} ${count === 1 ? 'thumbnail' : 'thumbnails'}`}
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
