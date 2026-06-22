import { makeRepo } from '@/lib/offline/repo';
import { authFetch } from '@/lib/session/authFetch';
import type { ProductRow } from '@/lib/offline/types';

const repo = makeRepo<ProductRow>('products');

/** In-memory hold for image files selected while the product has no serverId or the device is offline. */
const pendingImageFiles = new Map<string, File>();

/** Test helper: drop any held files. */
export function clearPendingImageFiles(): void {
  pendingImageFiles.clear();
}

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
    pendingImageFiles.set(clientId, file);
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
  pendingImageFiles.delete(clientId);
  return { uploaded: true };
}

/** Retry any images that were deferred and whose products now have a serverId. */
export async function retryPendingProductImages(businessId: string): Promise<{ retried: number }> {
  const rows = (await repo.list()).filter((r) => r.pendingImage && r.serverId);
  let retried = 0;
  for (const row of rows) {
    const file = pendingImageFiles.get(row.clientId);
    if (!file) continue;
    await uploadProductImage(row.clientId, file, businessId);
    retried += 1;
  }
  return { retried };
}
