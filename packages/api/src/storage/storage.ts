// The one place that talks to file storage (M4, OD-55; Q26). Today that's Supabase Storage;
// if Reparo moves files to Google Drive at Deploy, this module is what gets replaced.
//
// Supabase Storage REST, as the official client calls it (@supabase/storage-js 2.117.3, read
// from node_modules — observed behaviour): https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl
//   POST /storage/v1/bucket                         create a bucket
//   POST /storage/v1/object/upload/sign/{bucket}/{path}  → { url: "/object/upload/sign/…?token=…" }
//   POST /storage/v1/object/sign/{bucket}           { expiresIn, paths } → [{ path, signedURL }]
//   GET  /storage/v1/object/info/{bucket}/{path}    → { size, content_type, … }
// The new secret key goes on the `apikey` header, not `Authorization: Bearer`
// (https://supabase.com/docs/guides/api/api-keys).

/** What the API needs from storage. Tests use an in-memory fake. */
export interface Storage {
  readonly bucket: string;
  /** A one-time URL the browser PUTs the bytes to. Valid for 2 hours (storage-js docs). */
  createUploadUrl(path: string): Promise<{ url: string }>;
  /** Short-lived URLs to view each path; a path that doesn't exist maps to null. */
  createViewUrls(paths: string[], expiresInSeconds: number): Promise<Map<string, string | null>>;
  /** What storage holds at `path`, or null if nothing was uploaded there. */
  stat(path: string): Promise<{ sizeBytes: number; mimeType: string } | null>;
  /**
   * Send bytes from the server to an upload link, as the browser does (the spreadsheet image
   * import, OD-61). Not used by the app itself.
   */
  putBytes(uploadUrl: string, bytes: Uint8Array, mimeType: string): Promise<void>;
}

export interface SupabaseStorageConfig {
  /** `SUPABASE_URL`, e.g. http://127.0.0.1:54321 */
  url: string;
  /** `SUPABASE_SECRET_KEY` (sb_secret_…). Server only. */
  secretKey: string;
  bucket: string;
  /** Bucket limits, applied when the bucket is created. */
  fileSizeLimit: number;
  allowedMimeTypes: readonly string[];
  fetch?: typeof fetch;
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/** Encode each path segment, keeping the slashes. */
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export function createSupabaseStorage(cfg: SupabaseStorageConfig): Storage {
  const base = `${cfg.url.replace(/\/+$/, '')}/storage/v1`;
  const doFetch = cfg.fetch ?? fetch;
  const headers = { apikey: cfg.secretKey };
  let bucketReady: Promise<void> | null = null;

  function call(method: string, path: string, body?: unknown): Promise<Response> {
    const init: RequestInit =
      body === undefined
        ? { method, headers }
        : {
            method,
            headers: { ...headers, 'content-type': 'application/json' },
            body: JSON.stringify(body),
          };
    return doFetch(`${base}${path}`, init);
  }

  async function json<T>(res: Response, what: string): Promise<T> {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new StorageError(`Storage ${what} failed (${res.status}): ${text}`, res.status);
    }
    return (await res.json()) as T;
  }

  /**
   * An existing bucket must be what we'd have created: private, with our size limit and file
   * types. Anything else is refused, naming each difference, rather than used as is or quietly
   * changed (OD-166). Null means "no limit" (storage-js 2.117.3 JSDoc), so it counts as a
   * difference. Fields per the Storage server's bucket schema and GET /bucket/{id} route
   * (https://github.com/supabase/storage/blob/master/src/http/routes/bucket/getBucket.ts).
   */
  async function checkExistingBucket(): Promise<void> {
    const found = await json<Record<string, unknown>>(
      await call('GET', `/bucket/${encodeURIComponent(cfg.bucket)}`),
      'bucket check',
    );
    const problems: string[] = [];
    if (found['public'] !== false) problems.push('it is public');
    if (found['file_size_limit'] !== cfg.fileSizeLimit) {
      problems.push(
        `its size limit is ${String(found['file_size_limit'])}, not ${cfg.fileSizeLimit}`,
      );
    }
    const types = found['allowed_mime_types'];
    const sameTypes =
      Array.isArray(types) &&
      new Set(types).size === types.length &&
      types.length === cfg.allowedMimeTypes.length &&
      cfg.allowedMimeTypes.every((t) => types.includes(t));
    if (!sameTypes) {
      problems.push(
        `its file types are ${Array.isArray(types) ? types.join(', ') : String(types)}, not ${cfg.allowedMimeTypes.join(', ')}`,
      );
    }
    if (problems.length > 0) {
      throw new StorageError(
        `Storage bucket "${cfg.bucket}" isn't set up the way Reparo needs: ${problems.join('; ')}. Fix it in the Supabase dashboard.`,
      );
    }
  }

  /**
   * The private bucket, created on first use if it isn't there. Doing it here rather than in
   * supabase/config.toml covers local and hosted alike; the CLI docs don't say when config
   * buckets are applied. A 409 means it already exists, and then its settings are checked.
   */
  function ensureBucket(): Promise<void> {
    bucketReady ??= (async () => {
      const res = await call('POST', '/bucket', {
        id: cfg.bucket,
        name: cfg.bucket,
        public: false,
        file_size_limit: cfg.fileSizeLimit,
        allowed_mime_types: cfg.allowedMimeTypes,
      });
      if (res.ok) return;
      const text = await res.text().catch(() => '');
      // Storage answers an existing bucket with 409, or 400 carrying a 409 statusCode.
      if (res.status === 409 || /already exists|"statusCode":"409"/i.test(text)) {
        await checkExistingBucket();
        return;
      }
      throw new StorageError(`Storage bucket setup failed (${res.status}): ${text}`, res.status);
    })().catch((e: unknown) => {
      bucketReady = null; // try again on the next request
      throw e;
    });
    return bucketReady;
  }

  return {
    bucket: cfg.bucket,

    async createUploadUrl(path) {
      await ensureBucket();
      const res = await call('POST', `/object/upload/sign/${cfg.bucket}/${encodePath(path)}`, {});
      const data = await json<{ url: string }>(res, 'upload link');
      return { url: `${base}${data.url}` };
    },

    async createViewUrls(paths, expiresInSeconds) {
      const out = new Map<string, string | null>();
      if (paths.length === 0) return out;
      await ensureBucket();
      const res = await call('POST', `/object/sign/${cfg.bucket}`, {
        expiresIn: expiresInSeconds,
        paths,
      });
      const data = await json<{ path: string | null; signedURL: string | null }[]>(
        res,
        'view links',
      );
      // The response is in request order; storage-js reads it the same way.
      paths.forEach((p, i) => {
        const signed = data[i]?.signedURL;
        out.set(p, signed ? encodeURI(`${base}${signed}`) : null);
      });
      return out;
    },

    async putBytes(uploadUrl, bytes, mimeType) {
      const res = await doFetch(uploadUrl, {
        method: 'PUT',
        headers: { ...headers, 'content-type': mimeType, 'x-upsert': 'false' },
        // A copy on a plain ArrayBuffer: what fetch's BodyInit accepts under the DOM types.
        body: new Uint8Array(bytes),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new StorageError(`Storage upload failed (${res.status}): ${text}`, res.status);
      }
    },

    async stat(path) {
      await ensureBucket();
      const res = await call('GET', `/object/info/${cfg.bucket}/${encodePath(path)}`);
      if (res.status === 404 || res.status === 400) return null;
      const info = await json<{ size?: number; content_type?: string; contentType?: string }>(
        res,
        'file check',
      );
      return {
        sizeBytes: info.size ?? 0,
        mimeType: info.content_type ?? info.contentType ?? '',
      };
    },
  };
}
