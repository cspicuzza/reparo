import { describe, expect, it } from 'vitest';
import { acceptFor, formatSize, localProblem, nameFor } from './upload';

describe('upload helpers', () => {
  it('offers pictures only where pictures go, and never HEIC', () => {
    expect(acceptFor('rendering')).toBe('image/jpeg,image/png,image/webp');
    expect(acceptFor('receipt')).toBe('application/pdf,image/jpeg,image/png,image/webp');
    expect(acceptFor('progress_photo')).not.toMatch(/heic/);
  });

  it('says why a file is refused before sending it', () => {
    expect(localProblem('rendering', { type: 'image/heic', size: 10 })).toBe(
      'Pictures need to be JPEG, PNG or WebP',
    );
    expect(localProblem('paperwork', { type: 'application/zip', size: 10 })).toBe(
      'Files need to be a PDF, JPEG, PNG or WebP',
    );
    expect(localProblem('quote', { type: 'application/pdf', size: 51 * 1024 * 1024 })).toBe(
      'That file is over 50 MB',
    );
    expect(localProblem('quote', { type: 'application/pdf', size: 1 })).toBeNull();
  });

  it('names a pasted picture by when it was pasted', () => {
    const at = new Date('2026-10-15T19:30:00Z');
    expect(nameFor({ name: 'image.png', type: 'image/png' }, at)).toBe(
      'Pasted picture 2026-10-15 19.30.png',
    );
    expect(nameFor({ name: 'sofa.jpg', type: 'image/jpeg' }, at)).toBe('sofa.jpg');
  });

  it('formats sizes as people read them', () => {
    expect(formatSize(2_500_000)).toBe('2.4 MB');
    expect(formatSize(300)).toBe('1 KB');
    expect(formatSize(830 * 1024)).toBe('830 KB');
  });
});
