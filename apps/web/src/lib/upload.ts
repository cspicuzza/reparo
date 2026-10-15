import {
  fileProblem,
  FILE_MIME_TYPES,
  IMAGE_MIME_TYPES,
  PICTURE_KINDS,
  type FileKindInput,
  type FileOwner,
} from '@reparo/shared';
import type { RouterOutputs } from '@reparo/api';
import { env } from './env';
import { trpcClient } from './trpc';

// Uploading one file (M4, OD-56): ask the API for a link, send the bytes straight to storage
// (the API never sees them; Vercel caps a request at 4.5 MB), then ask the API to record what
// arrived. Storage's signed-upload route is the one storage-js 2.117.3 `uploadToSignedUrl` uses:
// a PUT with the publishable key on `apikey` and the token in the URL
// (https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl). XHR rather than
// fetch because fetch can't report upload progress.

export type FileView = RouterOutputs['files']['list'][number];

export type UploadTarget = {
  ownerType: FileOwner;
  ownerId: string;
  kind: FileKindInput;
  /** Progress photos: the day taken and the job shown. */
  takenOn?: string | null;
  jobId?: string | null;
  caption?: string;
};

/**
 * What the file picker offers. HEIC is left out on purpose: given only these, an iPhone hands
 * over a JPEG (Q8; Inferred from reports, to be tested on Chris's phone), and leaving HEIC out
 * also avoids Safari 17's HEIC bug (https://developer.apple.com/forums/thread/743049).
 */
export function acceptFor(kind: FileKindInput): string {
  return (PICTURE_KINDS.includes(kind) ? IMAGE_MIME_TYPES : FILE_MIME_TYPES).join(',');
}

/** The reason this file can't go here, before anything is sent, or null. */
export function localProblem(kind: FileKindInput, file: Pick<File, 'type' | 'size'>) {
  return fileProblem(kind, file.type, file.size);
}

/** A pasted picture has no useful name ("image.png"); give it one people can recognise. */
export function nameFor(file: Pick<File, 'name' | 'type'>, now = new Date()): string {
  if (file.name && file.name !== 'image.png' && file.name !== 'blob') return file.name;
  const ext = file.type.split('/')[1] ?? 'png';
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ').replace(':', '.');
  return `Pasted picture ${stamp}.${ext === 'jpeg' ? 'jpg' : ext}`;
}

function put(url: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('apikey', env.VITE_SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader('content-type', file.type);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`The upload didn't go through (${xhr.status}). Try again.`));
    xhr.onerror = () => reject(new Error("The upload didn't go through. Check the connection."));
    xhr.send(file);
  });
}

export async function uploadFile(
  file: File,
  target: UploadTarget,
  onProgress: (fraction: number) => void = () => {},
): Promise<FileView> {
  const problem = localProblem(target.kind, file);
  if (problem) throw new Error(problem);
  const base = {
    ownerType: target.ownerType,
    ownerId: target.ownerId,
    kind: target.kind,
    originalName: nameFor(file).slice(0, 255),
    mimeType: file.type,
    sizeBytes: file.size,
  };
  const { path, uploadUrl } = await trpcClient.files.uploadLink.mutate(base);
  await put(uploadUrl, file, onProgress);
  onProgress(1);
  return trpcClient.files.create.mutate({
    ...base,
    path,
    caption: target.caption ?? '',
    takenOn: target.takenOn ?? null,
    jobId: target.jobId ?? null,
  });
}

/** "2.4 MB", "830 KB": sizes as people read them. */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
