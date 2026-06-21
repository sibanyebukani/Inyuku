import { makeRepo } from '@/lib/offline/repo';
import { authFetch } from '@/lib/session/authFetch';
import type { ProductRow } from '@/lib/offline/types';

const repo = makeRepo<ProductRow>('products');

/** Upload a product image when the product is synced and the device is online; otherwise defer. */
export async function uploadProductImage(
  clientId: string,
  file: File,
  businessId: string,
): Promise<{ uploaded: boolean }> {
  const row = await repo.get(clientId);
  if (!row) return { uploaded: false };

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!row.serverId || offline) {
    await repo.put({ ...row, pendingImage: true });
    return { uploaded: false };
  }

  const form = new FormData();
  form.append('file', file);
  const { imageUrl } = await authFetch<{ imageUrl: string }>(
    `/v1/businesses/${businessId}/products/${row.serverId}/image`,
    { method: 'POST', body: form },
  );
  await repo.put({ ...row, imageUrl, pendingImage: false });
  return { uploaded: true };
}
