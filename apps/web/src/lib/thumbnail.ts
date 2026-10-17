/**
 * Small pictures for lists and tiles, made in the browser so no paid image service is needed
 * (OD-115, Q136; Q169–Q171). JPEG, because Safari can't save a canvas as WebP and quietly makes
 * a PNG instead, five to ten times the size (caniuse, checked 2026-10-16:
 * https://caniuse.com/mdn-api_htmlcanvaselement_toblob_type_parameter_webp). 640px on the
 * longest side covers a Home tile on a 2× laptop (about 524px) and a phone tile at 3× (about
 * 486px); measured on Chris's pictures it's 16–71 KB.
 */

/** The longest side of a thumbnail, in pixels. */
export const THUMB_LONGEST = 640;
/**
 * The longest side of the copy for the smallest tiles (OD-141, Q208): a shopping row's 56px
 * picture and a room card's 80 × 56 cover, at 2× on a laptop or phone.
 */
export const TINY_LONGEST = 160;
/** JPEG quality: 0.82 kept product shots crisp at 16–71 KB (measured 2026-10-16). */
export const THUMB_QUALITY = 0.82;

/** The thumbnail's size: scaled down to fit `longest`, never up, at least 1px each way. */
export function thumbSize(
  width: number,
  height: number,
  longest = THUMB_LONGEST,
): { width: number; height: number } {
  const scale = Math.min(1, longest / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * A JPEG thumbnail of a picture. `createImageBitmap` turns the photo the right way up from its
 * EXIF orientation by default (MDN: https://developer.mozilla.org/docs/Web/API/createImageBitmap;
 * Safari 15+). JPEG has no transparency, so a transparent product shot gets a white background.
 */
export async function makeThumbnail(source: Blob, longest = THUMB_LONGEST): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    const { width, height } = thumbSize(bitmap.width, bitmap.height, longest);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('This browser can’t draw pictures');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, width, height);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob?.type === 'image/jpeg' ? resolve(blob) : reject(new Error('No JPEG came out')),
        'image/jpeg',
        THUMB_QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}
