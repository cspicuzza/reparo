import { describe, expect, it } from 'vitest';
import {
  fetchLinkPicture,
  findPictureUrl,
  isPublicAddress,
  linkPictureMessage,
  sniffImage,
  type LinkPictureDeps,
} from './link-picture';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const WEBP = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');

/** A pretend internet: address → response, and host → addresses. No real network. */
function fakeNet(
  pages: Record<string, () => Response>,
  dns: Record<string, string[]> = {},
): LinkPictureDeps & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    lookup: (host) => Promise.resolve(dns[host] ?? ['93.184.216.34']),
    fetch: (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      asked.push(url);
      const page = pages[url];
      return Promise.resolve(page ? page() : new Response('nope', { status: 404 }));
    },
  };
}
const html = (body: string) =>
  new Response(`<html><head>${body}</head></html>`, { headers: { 'content-type': 'text/html' } });
const image = (bytes: Uint8Array, type = 'image/jpeg') =>
  new Response(bytes, { headers: { 'content-type': type } });

describe('isPublicAddress (OD-127)', () => {
  it('refuses local, private and internal addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      '::',
      'fc00::1',
      'fd12::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      'not an ip',
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });
  it('allows public ones', () => {
    for (const ip of ['93.184.216.34', '172.32.0.1', '8.8.8.8', '2606:4700::1111']) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });
});

describe('findPictureUrl', () => {
  const page = new URL('https://store.example/p/chair');
  it('takes og:image first, resolving relative addresses and entities', () => {
    expect(
      findPictureUrl(
        `<meta name="twitter:image" content="/t.jpg"><meta content="/img/chair.jpg?a=1&amp;b=2" property="og:image">`,
        page,
      ),
    ).toBe('https://store.example/img/chair.jpg?a=1&b=2');
  });
  it("falls back to a Product's JSON-LD image, then twitter:image, then image_src", () => {
    const ld = `<script type="application/ld+json">{"@graph":[{"@type":"Product","image":[{"url":"https://cdn.example/a.jpg"}]}]}</script>`;
    expect(findPictureUrl(ld, page)).toBe('https://cdn.example/a.jpg');
    expect(
      findPictureUrl(`<meta name="twitter:image" content="https://x.example/t.png">`, page),
    ).toBe('https://x.example/t.png');
    expect(findPictureUrl(`<link rel="image_src" href="//cdn.example/l.webp">`, page)).toBe(
      'https://cdn.example/l.webp',
    );
  });
  it('skips broken JSON-LD and finds nothing on a bare page', () => {
    expect(findPictureUrl(`<script type="application/ld+json">{oops</script>`, page)).toBeNull();
    expect(findPictureUrl('<title>Chair</title>', page)).toBeNull();
  });
});

describe('sniffImage', () => {
  it('goes by the first bytes', () => {
    expect(sniffImage(JPEG)).toBe('image/jpeg');
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(WEBP)).toBe('image/webp');
    expect(sniffImage(new TextEncoder().encode('<svg/>'))).toBeNull();
  });
});

describe('fetchLinkPicture', () => {
  it("returns the page's picture as base64 with a file name", async () => {
    const net = fakeNet({
      'https://store.example/p/chair': () =>
        html('<meta property="og:image" content="https://cdn.example/Oak%20Chair.jpeg">'),
      'https://cdn.example/Oak%20Chair.jpeg': () => image(JPEG, 'application/octet-stream'),
    });
    const got = await fetchLinkPicture('https://store.example/p/chair', net);
    expect(got).toEqual({
      mimeType: 'image/jpeg',
      fileName: 'Oak Chair.jpg',
      base64: Buffer.from(JPEG).toString('base64'),
    });
  });

  it('follows redirects, checking each hop', async () => {
    const net = fakeNet(
      {
        'https://store.example/short': () =>
          new Response(null, { status: 301, headers: { location: 'http://inside.example/' } }),
      },
      { 'inside.example': ['10.0.0.5'] },
    );
    await expect(fetchLinkPicture('https://store.example/short', net)).rejects.toMatchObject({
      reason: 'not-allowed',
    });
    expect(net.asked).toEqual(['https://store.example/short']);
  });

  it('never asks a private address or a non-web scheme', async () => {
    const net = fakeNet({}, { 'router.home': ['192.168.1.1'] });
    await expect(fetchLinkPicture('http://router.home/', net)).rejects.toMatchObject({
      reason: 'not-allowed',
    });
    await expect(fetchLinkPicture('http://127.0.0.1:3001/', net)).rejects.toMatchObject({
      reason: 'not-allowed',
    });
    await expect(fetchLinkPicture('file:///etc/passwd', net)).rejects.toMatchObject({
      reason: 'not-allowed',
    });
    expect(net.asked).toEqual([]);
  });

  it('names each problem', async () => {
    const blocked = fakeNet({ 'https://a.example/': () => new Response('', { status: 403 }) });
    await expect(fetchLinkPicture('https://a.example/', blocked)).rejects.toMatchObject({
      reason: 'blocked',
    });
    const bare = fakeNet({ 'https://a.example/': () => html('<title>x</title>') });
    await expect(fetchLinkPicture('https://a.example/', bare)).rejects.toMatchObject({
      reason: 'no-picture',
    });
    const svg = fakeNet({
      'https://a.example/': () => html('<meta property="og:image" content="/p.svg">'),
      'https://a.example/p.svg': () => image(new TextEncoder().encode('<svg/>'), 'image/svg+xml'),
    });
    await expect(fetchLinkPicture('https://a.example/', svg)).rejects.toMatchObject({
      reason: 'not-image',
    });
    const huge = fakeNet({
      'https://a.example/': () => html('<meta property="og:image" content="/p.jpg">'),
      'https://a.example/p.jpg': () => image(new Uint8Array(3 * 1024 * 1024 + 1)),
    });
    await expect(fetchLinkPicture('https://a.example/', huge)).rejects.toMatchObject({
      reason: 'too-big',
    });
    const gone = fakeNet({});
    await expect(fetchLinkPicture('https://a.example/missing', gone)).rejects.toMatchObject({
      reason: 'unreachable',
    });
  });

  it('says it in household words', () => {
    expect(linkPictureMessage('blocked', 'Amazon')).toBe(
      "Amazon didn't let us read that page. Add a picture yourself.",
    );
  });
});
