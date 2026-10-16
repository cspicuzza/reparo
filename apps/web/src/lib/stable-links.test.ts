import { describe, expect, it } from 'vitest';
import { createLinkKeeper, KEEP_LINK_MS } from './stable-links';

const link = (path: string, token: string) =>
  `http://127.0.0.1:54321/storage/v1/object/sign/files/${path}?token=${token}`;

describe('createLinkKeeper', () => {
  it('keeps the first link for an object while it is fresh', () => {
    let t = 0;
    const { stabilize } = createLinkKeeper(() => t);
    const first = [{ id: 'a', url: link('room/1/a.png', 'one'), thumbUrl: null }];
    expect(stabilize(first)).toEqual(first);
    t = KEEP_LINK_MS - 1;
    const again = [{ id: 'a', url: link('room/1/a.png', 'two'), thumbUrl: null }];
    expect(stabilize(again)).toEqual(first);
  });

  it('takes the new link once the old one is 45 minutes old', () => {
    let t = 0;
    const { stabilize } = createLinkKeeper(() => t);
    stabilize({ url: link('room/1/a.png', 'one') });
    t = KEEP_LINK_MS;
    const fresh = { url: link('room/1/a.png', 'two') };
    expect(stabilize(fresh)).toEqual(fresh);
  });

  it('leaves everything that is not a signed storage link alone', () => {
    const { stabilize } = createLinkKeeper(() => 0);
    const data = { name: 'Lamp', link: 'https://www.wayfair.com/x?y=1', n: 3, at: null };
    expect(stabilize(data)).toEqual(data);
  });

  it('tells objects apart by their path', () => {
    const { stabilize } = createLinkKeeper(() => 0);
    stabilize(link('room/1/a.png', 'one'));
    expect(stabilize(link('room/1/b.png', 'two'))).toBe(link('room/1/b.png', 'two'));
  });
});
