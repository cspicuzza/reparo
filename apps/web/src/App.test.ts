import { describe, expect, it } from 'vitest';
import { PACKAGE } from '@reparo/shared';

describe('@reparo/web', () => {
  it('resolves the shared workspace package', () => {
    expect(PACKAGE).toBe('@reparo/shared');
  });
});
