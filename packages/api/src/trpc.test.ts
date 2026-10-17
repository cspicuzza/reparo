import { TRPCError, type TRPCDefaultErrorShape } from '@trpc/server';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { formatError, INTERNAL_MESSAGE, showsRawErrors } from './trpc';

// The error formatter on its own (OD-168); the request path is covered in api.test.ts.
const shapeOf = (error: TRPCError, httpStatus: number): TRPCDefaultErrorShape => ({
  message: error.message,
  code: -32603,
  data: { code: error.code, httpStatus, path: 'x.y', stack: 'Error: …\n    at secret.ts:1' },
});

describe('formatError()', () => {
  const internal = new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    cause: new Error('Failed query: select * from members where email = $1\nparams: secret'),
  });

  it('hides an internal error and its stack outside local development', () => {
    const out = formatError({ shape: shapeOf(internal, 500), error: internal }, false);
    expect(out.message).toBe(INTERNAL_MESSAGE);
    expect(out.data).not.toHaveProperty('stack');
    expect(JSON.stringify(out)).not.toContain('secret');
  });

  it('shows it as it is locally', () => {
    const out = formatError({ shape: shapeOf(internal, 500), error: internal }, true);
    expect(out.message).toMatch(/^Failed query/);
    expect(out.data.stack).toBeDefined();
  });

  it('keeps the messages the app writes itself, without a stack', () => {
    for (const code of ['NOT_FOUND', 'CONFLICT', 'FORBIDDEN'] as const) {
      const error = new TRPCError({ code, message: `${code} words` });
      const out = formatError({ shape: shapeOf(error, 400), error }, false);
      expect(out.message).toBe(`${code} words`);
      expect(out.data).not.toHaveProperty('stack');
    }
  });

  it('keeps schema words for bad input', () => {
    const zod = z.object({ name: z.string().min(1, 'Enter a name') }).safeParse({ name: '' });
    if (zod.success) throw new Error('expected a failure');
    const error = new TRPCError({ code: 'BAD_REQUEST', cause: zod.error });
    const out = formatError({ shape: shapeOf(error, 400), error }, false);
    expect(out.message).toBe('Enter a name');
    expect(out.data).not.toHaveProperty('stack');
  });
});

describe('showsRawErrors()', () => {
  it('only for APP_ENV=local; missing or unknown counts as hosted', () => {
    expect(showsRawErrors({ APP_ENV: 'local' })).toBe(true);
    expect(showsRawErrors({ APP_ENV: 'preview' })).toBe(false);
    expect(showsRawErrors({ APP_ENV: 'production' })).toBe(false);
    expect(showsRawErrors({ APP_ENV: 'staging' })).toBe(false);
    expect(showsRawErrors({})).toBe(false);
  });
});
