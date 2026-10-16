import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Db } from '@reparo/db';
import { badRequest } from './errors';
import { getShoppingLine } from './shopping-lines';

/**
 * Pictures from product links (OD-127, Q177–Q179): fetch a line's product page, find its main
 * picture, and fetch that, so the browser can make the thumbnail and save it through the normal
 * upload. The API reads pages on other sites, so every request is guarded:
 * - http and https only, at most 5 redirects, each hop checked again;
 * - never a local, private or otherwise internal address (the host's DNS answers are checked);
 * - 10 seconds per request, 3 MB for a page and 3 MB for a picture (the picture travels back as
 *   base64 in the response, and Vercel caps a response at 4.5 MB:
 *   https://vercel.com/docs/functions/limitations#request-body-size);
 * - only JPEG, PNG or WebP, judged by the file's own first bytes.
 */

export const LINK_PICTURE_MAX_BYTES = 3 * 1024 * 1024;
const PAGE_MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
// Stores answer an ordinary browser; a bare script often gets an error page instead.
const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
};

export type LinkPictureReason =
  'not-allowed' | 'blocked' | 'unreachable' | 'no-picture' | 'not-image' | 'too-big';

export class LinkPictureProblem extends Error {
  constructor(
    readonly reason: LinkPictureReason,
    detail: string,
  ) {
    super(detail);
  }
}

export type LinkPictureDeps = {
  fetch: typeof fetch;
  /** Every address the host name resolves to. */
  lookup: (host: string) => Promise<string[]>;
};

export const defaultLinkPictureDeps: LinkPictureDeps = {
  fetch: (input, init) => fetch(input, init),
  lookup: async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address),
};

const v4 = (ip: string) => ip.split('.').map(Number);

/** True only for an address on the public internet. */
export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const [a = 0, b = 0, c = 0] = v4(ip);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this host, private, loopback, multicast/reserved
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a === 169 && b === 254) return false; // link-local (cloud metadata lives here)
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
    return true;
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped?.[1]) return isPublicAddress(mapped[1]);
    if (lower === '::' || lower === '::1') return false;
    if (/^f[cd]/.test(lower)) return false; // unique local
    if (/^fe[89ab]/.test(lower)) return false; // link-local
    if (/^ff/.test(lower)) return false; // multicast
    return true;
  }
  return false;
}

async function checkUrl(raw: string, deps: LinkPictureDeps): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LinkPictureProblem('not-allowed', 'not a web address');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new LinkPictureProblem('not-allowed', `${url.protocol} isn't a web address`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : await deps.lookup(host).catch(() => []);
  if (addresses.length === 0) throw new LinkPictureProblem('unreachable', `no address for ${host}`);
  if (!addresses.every(isPublicAddress)) {
    throw new LinkPictureProblem('not-allowed', `${host} isn't on the public internet`);
  }
  return url;
}

/** Fetch with every redirect hop checked, then read the body up to `maxBytes`. */
async function guardedGet(
  raw: string,
  deps: LinkPictureDeps,
  maxBytes: number,
  accept: string,
): Promise<{ url: URL; contentType: string; body: Uint8Array }> {
  let url = await checkUrl(raw, deps);
  for (let hop = 0; ; hop++) {
    let res: Response;
    try {
      res = await deps.fetch(url, {
        redirect: 'manual',
        headers: { ...HEADERS, accept },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new LinkPictureProblem('unreachable', e instanceof Error ? e.message : 'fetch failed');
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next || hop >= MAX_REDIRECTS) {
        throw new LinkPictureProblem('unreachable', 'too many redirects');
      }
      url = await checkUrl(new URL(next, url).href, deps);
      continue;
    }
    if ([401, 403, 405, 429, 503].includes(res.status)) {
      throw new LinkPictureProblem('blocked', `answered ${res.status}`);
    }
    if (!res.ok) throw new LinkPictureProblem('unreachable', `answered ${res.status}`);
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > maxBytes) throw new LinkPictureProblem('too-big', `${declared} bytes`);
    const body = await readCapped(res, maxBytes);
    return { url, contentType: res.headers.get('content-type') ?? '', body };
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  // Node's types leave the chunk type open; a fetch body's chunks are bytes.
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new LinkPictureProblem('too-big', `over ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;|&#47;/g, '/');

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '') : null;
};

/** The image(s) a JSON-LD block gives for a Product, if any. */
function ldImages(value: unknown): string[] {
  const out: string[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const type = obj['@type'];
    const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
    if (isProduct) {
      const img = obj['image'];
      const list = Array.isArray(img) ? img : [img];
      for (const i of list) {
        if (typeof i === 'string') out.push(i);
        else if (i && typeof i === 'object' && typeof (i as { url?: unknown }).url === 'string') {
          out.push((i as { url: string }).url);
        }
      }
    }
    if (obj['@graph']) visit(obj['@graph']);
  };
  visit(value);
  return out;
}

/**
 * A page's main picture: its `og:image` (what link previews use), then a Product's image in its
 * JSON-LD, then `twitter:image`, then `<link rel="image_src">`. Relative addresses resolve
 * against the page.
 */
export function findPictureUrl(html: string, page: URL): string | null {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = (key: string) => {
    for (const tag of metas) {
      const k = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase();
      if (k === key) {
        const content = attr(tag, 'content');
        if (content) return content;
      }
    }
    return null;
  };
  const candidates: (string | null)[] = [meta('og:image:secure_url'), meta('og:image')];
  for (const m of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      candidates.push(...ldImages(JSON.parse(m[1] ?? '')));
    } catch {
      // A store's broken JSON-LD just isn't used.
    }
  }
  candidates.push(meta('twitter:image'), meta('twitter:image:src'));
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if ((attr(tag, 'rel') ?? '').toLowerCase() === 'image_src') candidates.push(attr(tag, 'href'));
  }
  for (const c of candidates) {
    if (!c) continue;
    try {
      const url = new URL(c.trim(), page);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch {
      // Not an address; try the next.
    }
  }
  return null;
}

/** What the file's first bytes say it is; the header's word isn't trusted. */
export function sniffImage(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;

/** Fetch a product page and its main picture. Throws `LinkPictureProblem`. */
export async function fetchLinkPicture(link: string, deps: LinkPictureDeps) {
  const page = await guardedGet(link, deps, PAGE_MAX_BYTES, 'text/html,application/xhtml+xml');
  const html = new TextDecoder().decode(page.body);
  const pictureUrl = findPictureUrl(html, page.url);
  if (!pictureUrl) throw new LinkPictureProblem('no-picture', 'no picture on the page');
  const picture = await guardedGet(pictureUrl, deps, LINK_PICTURE_MAX_BYTES, 'image/*');
  const mimeType = sniffImage(picture.body);
  if (!mimeType) {
    throw new LinkPictureProblem('not-image', picture.contentType || 'unknown type');
  }
  const base =
    decodeURIComponent(new URL(pictureUrl).pathname.split('/').pop() ?? '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^\w .-]+/g, '')
      .trim()
      .slice(0, 80) || 'product';
  return {
    mimeType,
    fileName: `${base}.${EXT[mimeType]}`,
    base64: Buffer.from(picture.body).toString('base64'),
  };
}

/** The household words for each problem (Q179); `who` is the store, or the site's name. */
export function linkPictureMessage(reason: LinkPictureReason, who: string): string {
  switch (reason) {
    case 'blocked':
      return `${who} didn't let us read that page. Add a picture yourself.`;
    case 'unreachable':
      return `We couldn't reach that page. Check the link, or add a picture yourself.`;
    case 'no-picture':
      return `We couldn't find a picture on ${who}'s page. Add one yourself.`;
    case 'not-image':
      return `${who}'s picture isn't a JPEG, PNG or WebP, so it can't be kept. Add one yourself.`;
    case 'too-big':
      return `${who}'s picture is over 3 MB, too big to bring over. Add it yourself.`;
    case 'not-allowed':
      return `That link can't be read from here.`;
  }
}

/** A shopping line's picture from its link (OD-127). */
export async function pictureFromLink(db: Db, id: string, deps = defaultLinkPictureDeps) {
  const line = await getShoppingLine(db, id);
  if (!line.link) throw badRequest('This line has no link yet.');
  let who = line.store.trim();
  if (!who) {
    try {
      who = new URL(line.link).hostname.replace(/^www\./, '');
    } catch {
      who = 'That store';
    }
  }
  try {
    return await fetchLinkPicture(line.link, deps);
  } catch (e) {
    if (e instanceof LinkPictureProblem) throw badRequest(linkPictureMessage(e.reason, who));
    throw e;
  }
}
