import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  accessToken: vi.fn(),
}));

import { accessToken } from './supabase';
import { TRPCClientError } from '@trpc/client';
import { authHeaders, trpcErrorCode } from './trpc';
import { readViewAs, saveViewAs } from './view-as';

describe('authHeaders', () => {
  it('adds a Bearer header when signed in and nothing when signed out', async () => {
    vi.mocked(accessToken).mockResolvedValueOnce('tok');
    expect(await authHeaders()).toEqual({ authorization: 'Bearer tok' });
    vi.mocked(accessToken).mockResolvedValueOnce(null);
    expect(await authHeaders()).toEqual({});
  });
  it('says which role an admin is previewing, until they go back (OD-133)', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    saveViewAs('viewer');
    expect(readViewAs()).toBe('viewer');
    vi.mocked(accessToken).mockResolvedValueOnce('tok');
    expect(await authHeaders()).toEqual({
      authorization: 'Bearer tok',
      'x-reparo-view-as': 'viewer',
    });
    saveViewAs(null);
    expect(readViewAs()).toBeNull();
    vi.mocked(accessToken).mockResolvedValueOnce('tok');
    expect(await authHeaders()).toEqual({ authorization: 'Bearer tok' });
    // Anything but editor or viewer is ignored.
    store.set('reparo:view-as', 'admin');
    expect(readViewAs()).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('trpcErrorCode', () => {
  it('reads the code from a TRPCClientError and ignores everything else', () => {
    const err = new TRPCClientError('nope', {
      result: {
        error: { code: -32003, message: 'nope', data: { code: 'FORBIDDEN', httpStatus: 403 } },
      },
    });
    expect(trpcErrorCode(err)).toBe('FORBIDDEN');
    expect(trpcErrorCode(new Error('x'))).toBeUndefined();
    expect(trpcErrorCode(new TRPCClientError('no data'))).toBeUndefined();
  });
});
