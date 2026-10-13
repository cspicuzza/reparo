import { describe, expect, it } from 'vitest';
import { PACKAGE } from './index';

describe('@reparo/shared', () => {
  it('is wired', () => {
    expect(PACKAGE).toBe('@reparo/shared');
  });
});
