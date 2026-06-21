// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductForm } from './ProductForm';
import * as sessionMod from '@/lib/session/SessionProvider';
import * as imageMod from '@/lib/products/image';
import { useProductStore } from '@/lib/products/store';
import { openDb } from '@/lib/offline/db';
import type { ProductRow } from '@/lib/offline/types';

function mockSession(perms: string[]) {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [],
    activeBusinessId: 'biz1',
    hasPerm: (p: string) => perms.includes(p),
  });
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

async function seedRow(row: Partial<ProductRow> & { clientId: string }) {
  const full: ProductRow = {
    name: 'P',
    sellPriceCents: 100,
    status: 'ACTIVE',
    _syncState: 'pending',
    updatedAtLocal: '2026-06-21T10:00:00.000Z',
    ...row,
  } as ProductRow;
  const repo = (await import('@/lib/offline/repo')).makeRepo<ProductRow>('products');
  await repo.put(full);
  return full;
}

describe('ProductForm', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    setOnline(true);
    const db = await openDb();
    await db.clear('products');
    await db.clear('outbox');
    db.close();
    useProductStore.setState({ items: [] });
    imageMod.clearPendingImageFiles();
  });
  afterEach(() => vi.restoreAllMocks());

  it('hides the cost field for staff (no catalog:read_cost)', () => {
    mockSession(['catalog:write']);
    render(<ProductForm />);
    expect(screen.queryByLabelText(/cost price/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/sell price/i)).toBeInTheDocument();
  });

  it('shows a validation error and does NOT call create when sell price is invalid', async () => {
    mockSession(['catalog:write']);
    const createSpy = vi.spyOn(useProductStore.getState(), 'create').mockResolvedValue('cid');
    render(<ProductForm />);
    await userEvent.type(screen.getByLabelText(/name/i), 'Bread');
    await userEvent.type(screen.getByLabelText(/sell price/i), 'abc');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/enter a valid amount/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('shows a validation error for a price with too many decimal places', async () => {
    mockSession(['catalog:write']);
    const createSpy = vi.spyOn(useProductStore.getState(), 'create').mockResolvedValue('cid');
    render(<ProductForm />);
    await userEvent.type(screen.getByLabelText(/name/i), 'Bread');
    await userEvent.type(screen.getByLabelText(/sell price/i), '1.999');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/enter a valid amount/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('shows the cost field for owners and creates with parsed cents', async () => {
    mockSession(['catalog:write', 'catalog:read_cost']);
    const createSpy = vi.spyOn(useProductStore.getState(), 'create').mockResolvedValue('cid');
    render(<ProductForm />);
    await userEvent.type(screen.getByLabelText(/name/i), 'Bread');
    await userEvent.type(screen.getByLabelText(/sell price/i), '15.00');
    await userEvent.type(screen.getByLabelText(/cost price/i), '9.50');
    await userEvent.type(screen.getByLabelText(/low-stock threshold/i), '5');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Bread', sellPriceCents: 1500, costPriceCents: 950, lowStockThreshold: 5 }),
    );
  });

  it('prefills edit mode and calls update with parsed cents', async () => {
    mockSession(['catalog:write', 'catalog:read_cost']);
    const updateSpy = vi.spyOn(useProductStore.getState(), 'update').mockResolvedValue(undefined);
    const row: ProductRow = {
      clientId: 'p1',
      name: 'Bread',
      sellPriceCents: 1500,
      costPriceCents: 950,
      lowStockThreshold: 5,
      status: 'ACTIVE',
      _syncState: 'synced',
      updatedAtLocal: '2026-06-21T10:00:00.000Z',
    };
    render(<ProductForm row={row} />);
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('Bread');
    expect((screen.getByLabelText(/sell price/i) as HTMLInputElement).value).toBe('R 15.00');
    expect((screen.getByLabelText(/cost price/i) as HTMLInputElement).value).toBe('R 9.50');
    expect((screen.getByLabelText(/low-stock threshold/i) as HTMLInputElement).value).toBe('5');

    await userEvent.clear(screen.getByLabelText(/sell price/i));
    await userEvent.type(screen.getByLabelText(/sell price/i), '20.00');
    await userEvent.click(screen.getByRole('button', { name: /update product/i }));
    expect(updateSpy).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ name: 'Bread', sellPriceCents: 2000, costPriceCents: 950, lowStockThreshold: 5 }),
    );
  });

  it('hides the cost field for staff in edit mode', () => {
    mockSession(['catalog:write']);
    const row: ProductRow = {
      clientId: 'p1',
      name: 'Bread',
      sellPriceCents: 1500,
      costPriceCents: 950,
      status: 'ACTIVE',
      _syncState: 'synced',
      updatedAtLocal: '2026-06-21T10:00:00.000Z',
    };
    render(<ProductForm row={row} />);
    expect(screen.queryByLabelText(/cost price/i)).not.toBeInTheDocument();
    expect((screen.getByLabelText(/sell price/i) as HTMLInputElement).value).toBe('R 15.00');
  });

  it('calls uploadProductImage when a file is selected and the form is saved', async () => {
    mockSession(['catalog:write']);
    const createSpy = vi.spyOn(useProductStore.getState(), 'create').mockResolvedValue('cid1');
    const uploadSpy = vi.spyOn(imageMod, 'uploadProductImage').mockResolvedValue({ uploaded: true });
    render(<ProductForm />);
    await userEvent.type(screen.getByLabelText(/name/i), 'Milk');
    await userEvent.type(screen.getByLabelText(/sell price/i), '12.00');
    const file = new File(['x'], 'milk.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText(/image/i), file);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(uploadSpy).toHaveBeenCalledWith('cid1', file, 'biz1');
  });

  it('defers image upload when offline and uploads on reconnect via the post-sync sweep', async () => {
    mockSession(['catalog:write']);
    setOnline(false);
    render(<ProductForm />);
    await userEvent.type(screen.getByLabelText(/name/i), 'Eggs');
    await userEvent.type(screen.getByLabelText(/sell price/i), '30.00');
    const file = new File(['x'], 'eggs.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText(/image/i), file);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    // The real create wrote a pending row; offline + no serverId deferred the image.
    const repo = (await import('@/lib/offline/repo')).makeRepo<ProductRow>('products');
    let created = (await repo.list()).find((r) => r.name === 'Eggs');
    expect(created).toBeDefined();
    await waitFor(async () => {
      created = (await repo.get(created!.clientId));
      expect(created?.pendingImage).toBe(true);
    });
    const clientId = created!.clientId;

    // Simulate sync assigning a serverId, then go online and run the retry sweep.
    setOnline(true);
    await repo.put({ ...created!, serverId: 'srv2' });

    const authSpy = vi.spyOn(await import('@/lib/session/authFetch'), 'authFetch').mockResolvedValue({
      imageUrl: 'https://cdn/eggs.png',
    });
    const res = await imageMod.retryPendingProductImages('biz1');
    expect(res.retried).toBe(1);
    expect(authSpy).toHaveBeenCalledWith(
      '/v1/businesses/biz1/products/srv2/image',
      expect.objectContaining({ method: 'POST' }),
    );
    await waitFor(async () => {
      const uploaded = await repo.get(clientId);
      expect(uploaded?.imageUrl).toBe('https://cdn/eggs.png');
      expect(uploaded?.pendingImage).toBe(false);
    });
  });
});
