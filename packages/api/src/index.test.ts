import { describe, expect, it } from 'vitest';
import { PACKAGE } from './index';

describe('@reparo/api', () => {
  it('is wired', () => {
    expect(PACKAGE).toBe('@reparo/api');
  });
});
