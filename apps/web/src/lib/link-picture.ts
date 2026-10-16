import { trpcClient } from '@/lib/trpc';
import { uploadFile, type FileView } from '@/lib/upload';

/**
 * A shopping line's picture from its product link (OD-127, Q177): the API reads the store's page
 * and hands back the picture; it's saved like any picture you add, thumbnail and all. A store
 * that won't be read comes back as the API's own words ("Amazon didn't let us read that page.").
 */
export async function savePictureFromLink(lineId: string): Promise<FileView> {
  const got = await trpcClient.shoppingLines.pictureFromLink.mutate({ id: lineId });
  const bytes = Uint8Array.from(atob(got.base64), (c) => c.charCodeAt(0));
  const file = new File([bytes], got.fileName, { type: got.mimeType });
  return uploadFile(file, { ownerType: 'shopping_line', ownerId: lineId, kind: 'product_image' });
}
