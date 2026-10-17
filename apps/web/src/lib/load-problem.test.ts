import { TRPCClientError } from '@trpc/client';
import { describe, expect, it } from 'vitest';
import { loadProblem } from './load-problem';

const trpcError = (code: string) =>
  TRPCClientError.from({ error: { message: 'raw', code: -32000, data: { code } } });

describe('loadProblem', () => {
  it('names a dropped connection', () => {
    expect(loadProblem(new TypeError('Failed to fetch'))).toMatch(/connection dropped/);
    expect(loadProblem(new TypeError('Load failed'))).toMatch(/connection dropped/);
  });

  it('turns tRPC codes into household words', () => {
    expect(loadProblem(trpcError('UNAUTHORIZED'))).toMatch(/sign-in has run out/);
    expect(loadProblem(trpcError('FORBIDDEN'))).toMatch(/can't see it/);
    expect(loadProblem(trpcError('NOT_FOUND'))).toMatch(/isn't here/);
    expect(loadProblem(trpcError('INTERNAL_SERVER_ERROR'))).toMatch(/went wrong/);
  });

  it('never shows the raw message', () => {
    expect(loadProblem(new Error('{"issues":[]}'))).toBe('Something went wrong on the server.');
    expect(loadProblem('nope')).toBe('Something went wrong on the server.');
  });
});
