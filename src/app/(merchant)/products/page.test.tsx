// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProductsPage from './page';
import * as sessionMod from '@/lib/session/SessionProvider';
import * as authMod from '@/lib/session/authFetch';
import { useProductStore } from '@/lib/products/store';
import { openDb } from '@/lib/offline/db';
import { makeRepo } from '@/lib/offline/repo';
import type { ProductRow } from '@/lib/offline/types';

function mockSession(perms: string[]) {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [], activeBusinessId: 'biz1', hasPerm: (p: string) => perms.includes(p),
  });
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

async function seedProduct(row: Partial<ProductRow> & { clientId: string }) {
  const full: ProductRow = {
    name: 'P',
    sellPriceCents: 100,
    status: 'ACTIVE',
    _syncState: 'synced',
    updatedAtLocal: '2026-06-21T10:00:00.000Z',
    ...row,
  } as ProductRow;
  const repo = makeRepo<ProductRow>('products');
  await repo.put(full);
  return full;
}

describe('ProductsPage', () => {
  beforeEach(async () => {
    setOnline(true);
    const db = await openDb();
    await db.clear('products');
    await db.clear('outbox');
    db.close();
    useProductStore.setState({ items: [] });
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders active products with ZAR prices; hides cost for staff', async () => {
    mockSession(['catalog:read', 'catalog:write']);
    await useProductStore.getState().create({ name: 'Bread', sellPriceCents: 1500, costPriceCents: 900 });
    render(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Bread')).toBeInTheDocument());
    expect(screen.getByText('R 15.00')).toBeInTheDocument();
    expect(screen.queryByText('R 9.00')).not.toBeInTheDocument(); // cost hidden for staff
  });

  it('shows cost for owners', async () => {
    mockSession(['catalog:read', 'catalog:write', 'catalog:read_cost']);
    await useProductStore.getState().create({ name: 'Bread', sellPriceCents: 1500, costPriceCents: 900 });
    render(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('R 9.00')).toBeInTheDocument());
  });

  it('archives a product after confirming and removes it from the active list', async () => {
    mockSession(['catalog:read', 'catalog:write']);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await useProductStore.getState().create({ name: 'Milk', sellPriceCents: 1200 });
    render(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Milk')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /archive/i }));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Milk')).not.toBeInTheDocument());
  });

  it('opens the edit form pre-filled when Edit is clicked', async () => {
    mockSession(['catalog:read', 'catalog:write', 'catalog:read_cost']);
    await useProductStore.getState().create({ name: 'Tea', sellPriceCents: 2500, costPriceCents: 1500, lowStockThreshold: 3 });
    render(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Tea')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    await waitFor(() => expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('Tea'));
    expect((screen.getByLabelText(/sell price/i) as HTMLInputElement).value).toBe('R 25.00');
    expect((screen.getByLabelText(/cost price/i) as HTMLInputElement).value).toBe('R 15.00');
    expect((screen.getByLabelText(/low-stock threshold/i) as HTMLInputElement).value).toBe('3');
  });

  it('surfaces a low-stock flag when current stock is at or below the threshold', async () => {
    mockSession(['catalog:read', 'catalog:write', 'inventory:read']);
    vi.spyOn(authMod, 'authFetch').mockResolvedValue({ stockLevel: 2 });
    await seedProduct({ clientId: 'p1', name: 'Sugar', sellPriceCents: 800, lowStockThreshold: 3, serverId: 'srv1' });
    render(<ProductsPage />);
    await waitFor(() => expect(screen.getByText(/low stock/i)).toBeInTheDocument());
    expect(screen.getByText(/2 left/i)).toBeInTheDocument();
  });

  it('shows a stale hint for last-known stock when the device goes offline', async () => {
    mockSession(['catalog:read', 'catalog:write', 'inventory:read']);
    vi.spyOn(authMod, 'authFetch').mockResolvedValue({ stockLevel: 4 });
    await seedProduct({ clientId: 'p1', name: 'Flour', sellPriceCents: 1200, lowStockThreshold: 10, serverId: 'srv1' });
    render(<ProductsPage />);
    await waitFor(() => expect(screen.getByText(/4 left/i)).toBeInTheDocument());
    setOnline(false);
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => expect(screen.getByText(/stock last-known \(offline\)/i)).toBeInTheDocument());
  });
});
