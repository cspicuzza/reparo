import { describe, expect, it } from 'vitest';
import { createSupabaseStorage } from './storage';

// The Supabase calls as storage-js 2.117.3 makes them (read from node_modules), checked against
// a recording fetch. What a real Storage server answers is checked by hand on Chris's machine.

type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };

function recorder(answers: ((c: Call) => Response)[]) {
  const calls: Call[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      url: input instanceof Request ? input.url : input.toString(),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const answer = answers.shift();
    if (!answer) throw new Error(`unexpected call ${call.method} ${call.url}`);
    return Promise.resolve(answer(call));
  };
  return { calls, fetchFn };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const make = (fetchFn: typeof fetch) =>
  createSupabaseStorage({
    url: 'http://127.0.0.1:54321/',
    secretKey: 'sb_secret_test',
    bucket: 'files',
    fileSizeLimit: 52428800,
    allowedMimeTypes: ['application/pdf', 'image/jpeg'],
    fetch: fetchFn,
  });

describe('Supabase storage', () => {
  it('creates the private bucket once, then signs an upload link', async () => {
    const { calls, fetchFn } = recorder([
      () => json({ name: 'files' }),
      () => json({ url: '/object/upload/sign/files/room/a/b.jpg?token=T1' }),
      () => json({ url: '/object/upload/sign/files/room/a/c.jpg?token=T2' }),
    ]);
    const s = make(fetchFn);
    const one = await s.createUploadUrl('room/a/b.jpg');
    await s.createUploadUrl('room/a/c.jpg');

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST http://127.0.0.1:54321/storage/v1/bucket',
      'POST http://127.0.0.1:54321/storage/v1/object/upload/sign/files/room/a/b.jpg',
      'POST http://127.0.0.1:54321/storage/v1/object/upload/sign/files/room/a/c.jpg',
    ]);
    expect(calls[0]?.body).toEqual({
      id: 'files',
      name: 'files',
      public: false,
      file_size_limit: 52428800,
      allowed_mime_types: ['application/pdf', 'image/jpeg'],
    });
    // The secret key rides on `apikey` only (https://supabase.com/docs/guides/api/api-keys).
    expect(calls.every((c) => c.headers['apikey'] === 'sb_secret_test')).toBe(true);
    expect(calls.some((c) => 'authorization' in c.headers || 'Authorization' in c.headers)).toBe(
      false,
    );
    expect(one.url).toBe(
      'http://127.0.0.1:54321/storage/v1/object/upload/sign/files/room/a/b.jpg?token=T1',
    );
  });

  const exists = () =>
    json({ statusCode: '409', error: 'Duplicate', message: 'already exists' }, 400);
  const bucket = (over: Record<string, unknown> = {}) =>
    json({
      id: 'files',
      name: 'files',
      public: false,
      file_size_limit: 52428800,
      allowed_mime_types: ['application/pdf', 'image/jpeg'],
      ...over,
    });

  it('treats an existing bucket as ready once its settings match', async () => {
    const { calls, fetchFn } = recorder([
      exists,
      () => bucket(),
      () => json({ size: 12, content_type: 'image/jpeg' }),
    ]);
    expect(await make(fetchFn).stat('room/a/b.jpg')).toEqual({
      sizeBytes: 12,
      mimeType: 'image/jpeg',
    });
    expect(calls[1]).toMatchObject({
      method: 'GET',
      url: 'http://127.0.0.1:54321/storage/v1/bucket/files',
    });
  });

  it('accepts the same file types in another order', async () => {
    const { fetchFn } = recorder([
      exists,
      () => bucket({ allowed_mime_types: ['image/jpeg', 'application/pdf'] }),
      () => json({ size: 1, content_type: 'application/pdf' }),
    ]);
    await expect(make(fetchFn).stat('x')).resolves.toBeTruthy();
  });

  it.each([
    [{ public: true }, /it is public/],
    [{ file_size_limit: 1024 }, /size limit is 1024, not 52428800/],
    [{ file_size_limit: null }, /size limit is null/],
    [{ allowed_mime_types: ['application/pdf'] }, /file types are application\/pdf, not/],
    [{ allowed_mime_types: null }, /file types are null/],
  ])('refuses an existing bucket set up differently (%j)', async (over, message) => {
    const { calls, fetchFn } = recorder([exists, () => bucket(over)]);
    await expect(make(fetchFn).stat('x')).rejects.toThrow(message);
    expect(calls).toHaveLength(2); // no update is sent
  });

  it('retries the bucket check after it fails', async () => {
    const { calls, fetchFn } = recorder([
      exists,
      () => new Response('down', { status: 503 }),
      exists,
      () => bucket(),
      () => json({ size: 1, content_type: 'application/pdf' }),
    ]);
    const s = make(fetchFn);
    await expect(s.stat('x')).rejects.toThrow(/bucket check failed \(503\)/);
    await s.stat('x');
    expect(calls).toHaveLength(5);
  });

  it('retries bucket setup after a failure', async () => {
    const { calls, fetchFn } = recorder([
      () => new Response('down', { status: 503 }),
      () => json({ name: 'files' }),
      () => json({ size: 1, content_type: 'application/pdf' }),
    ]);
    const s = make(fetchFn);
    await expect(s.stat('x')).rejects.toThrow(/bucket setup failed \(503\)/);
    await s.stat('x');
    expect(calls).toHaveLength(3);
  });

  it('signs view links in one call and maps missing objects to null', async () => {
    const { calls, fetchFn } = recorder([
      () => json({ name: 'files' }),
      () =>
        json([
          { path: 'room/a/1.jpg', signedURL: '/object/sign/files/room/a/1.jpg?token=V1' },
          { path: 'room/a/2.jpg', signedURL: null, error: 'Either the object does not exist' },
        ]),
    ]);
    const urls = await make(fetchFn).createViewUrls(['room/a/1.jpg', 'room/a/2.jpg'], 3600);
    expect(calls[1]?.url).toBe('http://127.0.0.1:54321/storage/v1/object/sign/files');
    expect(calls[1]?.body).toEqual({ expiresIn: 3600, paths: ['room/a/1.jpg', 'room/a/2.jpg'] });
    expect(urls.get('room/a/1.jpg')).toBe(
      'http://127.0.0.1:54321/storage/v1/object/sign/files/room/a/1.jpg?token=V1',
    );
    expect(urls.get('room/a/2.jpg')).toBeNull();
  });

  it('says nothing is there when storage answers 404', async () => {
    const { fetchFn } = recorder([
      () => json({ name: 'files' }),
      () => json({ statusCode: '404', message: 'Object not found' }, 404),
    ]);
    expect(await make(fetchFn).stat('room/a/none.jpg')).toBeNull();
  });
});
