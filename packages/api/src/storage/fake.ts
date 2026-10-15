import type { Storage } from './storage';

/**
 * In-memory storage for tests: `put` stands in for the browser's upload. View URLs are
 * `fake://bucket/path?expires=N` so tests can see what was signed.
 */
export function createFakeStorage(bucket = 'files') {
  const objects = new Map<string, { sizeBytes: number; mimeType: string }>();
  const storage: Storage & {
    put(path: string, sizeBytes: number, mimeType: string): void;
    signedUploads: string[];
  } = {
    bucket,
    signedUploads: [],
    put(path, sizeBytes, mimeType) {
      objects.set(path, { sizeBytes, mimeType });
    },
    createUploadUrl(path) {
      storage.signedUploads.push(path);
      return Promise.resolve({ url: `fake://${bucket}/upload/${path}` });
    },
    createViewUrls(paths, expiresInSeconds) {
      return Promise.resolve(
        new Map(
          paths.map((p) => [
            p,
            objects.has(p) ? `fake://${bucket}/${p}?expires=${expiresInSeconds}` : null,
          ]),
        ),
      );
    },
    stat(path) {
      return Promise.resolve(objects.get(path) ?? null);
    },
    putBytes(uploadUrl, bytes, mimeType) {
      const path = uploadUrl.replace(`fake://${bucket}/upload/`, '');
      objects.set(path, { sizeBytes: bytes.byteLength, mimeType });
      return Promise.resolve();
    },
  };
  return storage;
}
