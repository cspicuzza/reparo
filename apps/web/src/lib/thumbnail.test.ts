import { describe, expect, it } from 'vitest';
import { thumbSize } from './thumbnail';

describe('thumbSize', () => {
  it('fits the longest side to 640, keeping the shape', () => {
    expect(thumbSize(2048, 2048)).toEqual({ width: 640, height: 640 });
    expect(thumbSize(1298, 1702)).toEqual({ width: 488, height: 640 });
    expect(thumbSize(4032, 3024)).toEqual({ width: 640, height: 480 });
  });

  it('never makes a small picture bigger', () => {
    expect(thumbSize(300, 200)).toEqual({ width: 300, height: 200 });
  });

  it('keeps a very thin picture at least a pixel wide', () => {
    expect(thumbSize(10_000, 3)).toEqual({ width: 640, height: 1 });
  });
});
