// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadProductImage } from './image';
import { makeRepo } from '@/lib/offline/repo';
import { openDb } from '@/lib/offline/db';
import * as authMod from '@/lib/session/authFetch';
import type { ProductRow } from '@/lib/offline/types';

const repo = makeRepo<ProductRow>('products');
const file = new File(['x'], 'a.png', { type: 'image/png' });

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

async function put(row: Partial<ProductRow> & { clientId: string }) {
  await repo.put({ name: 'P', sellPriceCents: 1, status: 'ACTIVE', _syncState: 'synced', updatedAtLocal: 'x', ...row });
}

describe('uploadProductImage', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('products');
    db.close();
    setOnline(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it('defers when the product is not yet synced (no serverId)', async () => {
    await put({ clientId: 'p1' });
    const res = await uploadProductImage('p1', file, 'biz1');
    expect(res).toEqual({ uploaded: false });
    expect((await repo.get('p1'))?.pendingImage).toBe(true);
  });

  it('defers when offline', async () => {
    await put({ clientId: 'p2', serverId: 'srv2' });
    setOnline(false);
    const res = await uploadProductImage('p2', file, 'biz1');
    expect(res).toEqual({ uploaded: false });
    expect((await repo.get('p2'))?.pendingImage).toBe(true);
  });

  it('uploads when synced and online, storing imageUrl', async () => {
    await put({ clientId: 'p3', serverId: 'srv3', pendingImage: true });
    const spy = vi.spyOn(authMod, 'authFetch').mockResolvedValue({ imageUrl: 'https://cdn/x.png' });
    const res = await uploadProductImage('p3', file, 'biz1');
    expect(res).toEqual({ uploaded: true });
    expect(spy.mock.calls[0][0]).toBe('/v1/businesses/biz1/products/srv3/image');
    const row = await repo.get('p3');
    expect(row?.imageUrl).toBe('https://cdn/x.png');
    expect(row?.pendingImage).toBe(false);
  });
});
