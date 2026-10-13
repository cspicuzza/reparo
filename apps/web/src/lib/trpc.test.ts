import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  accessToken: vi.fn(),
}));

import { accessToken } from './supabase';
import { TRPCClientError } from '@trpc/client';
import { authHeaders, trpcErrorCode } from './trpc';

describe('authHeaders', () => {
  it('adds a Bearer header when signed in and nothing when signed out', async () => {
    vi.mocked(accessToken).mockResolvedValueOnce('tok');
    expect(await authHeaders()).toEqual({ authorization: 'Bearer tok' });
    vi.mocked(accessToken).mockResolvedValueOnce(null);
    expect(await authHeaders()).toEqual({});
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
