import { AuthApiError, AuthImplicitGrantRedirectError } from '@supabase/supabase-js';
import { signInSearchSchema } from '@reparo/shared';
import { describe, expect, it } from 'vitest';
import { authErrorParts, signInProblem } from './sign-in-problem';

describe('signInProblem()', () => {
  it.each([
    [{ code: 'flow_state_expired' }, 'Sign-in took too long. Try again.'],
    [{ code: 'flow_state_not_found' }, 'Sign-in took too long. Try again.'],
    [
      { code: 'over_request_rate_limit' },
      'Too many tries just now. Wait a few minutes, then try again.',
    ],
    [
      { error: 'access_denied', code: 'signup_disabled' },
      "This account can't sign in here. Use your household Google account.",
    ],
    [{ error: 'server_error', code: 'unexpected_failure' }, "Sign-in didn't work. Try again."],
    [{ error: 'something_new' }, "Sign-in didn't work. Try again."],
  ])('%j → %s', (input, words) => {
    expect(signInProblem(input)).toBe(words);
  });

  it('says nothing when nothing went wrong', () => {
    expect(signInProblem({})).toBeNull();
  });

  it('never shows the code', () => {
    expect(signInProblem({ code: 'unexpected_failure' })).not.toContain('unexpected');
  });
});

describe('authErrorParts()', () => {
  it('reads a failed redirect from its details and a failed exchange from its code', () => {
    expect(
      authErrorParts(
        new AuthImplicitGrantRedirectError('x', {
          error: 'access_denied',
          code: 'signup_disabled',
        }),
      ),
    ).toEqual({ error: 'access_denied', code: 'signup_disabled' });
    expect(authErrorParts(new AuthApiError('x', 404, 'flow_state_not_found'))).toEqual({
      code: 'flow_state_not_found',
    });
    expect(authErrorParts(null)).toEqual({});
  });
});

describe('signInSearchSchema', () => {
  it('drops junk and overlong values instead of failing', () => {
    expect(
      signInSearchSchema.parse({ error: 'access_denied', error_code: 'signup_disabled' }),
    ).toEqual({ error: 'access_denied', error_code: 'signup_disabled' });
    expect(signInSearchSchema.parse({ error: 'x'.repeat(201), error_code: 5 })).toEqual({});
    expect(signInSearchSchema.parse({ code: 'abc' })).toEqual({});
  });
});
