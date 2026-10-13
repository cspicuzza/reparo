import { describe, expect, it } from 'vitest';
import { PACKAGE } from './index';

describe('@reparo/db', () => {
  it('is wired', () => {
    expect(PACKAGE).toBe('@reparo/db');
  });
});
