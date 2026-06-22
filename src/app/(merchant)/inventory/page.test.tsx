// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InventoryPage from './page';
import * as sessionMod from '@/lib/session/SessionProvider';
import * as authMod from '@/lib/session/authFetch';
import { useProductStore } from '@/lib/products/store';
import { useInventoryStore } from '@/lib/inventory/store';
import { openDb } from '@/lib/offline/db';
import { makeRepo } from '@/lib/offline/repo';
import type { ProductRow, StockMovementRow } from '@/lib/offline/types';

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

describe('InventoryPage', () => {
  beforeEach(async () => {
    setOnline(true);
    const db = await openDb();
    await db.clear('products');
    await db.clear('stockMovements');
    await db.clear('outbox');
    db.close();
    useProductStore.setState({ items: [] });
    useInventoryStore.setState({ items: [] });
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('lists active products and records an adjustment', async () => {
    mockSession(['catalog:read', 'inventory:read', 'inventory:write']);
    vi.spyOn(authMod, 'authFetch').mockResolvedValue({ stockLevel: 5 });
    await seedProduct({ clientId: 'p1', name: 'Sugar', serverId: 'srv1' });
    render(<InventoryPage />);

    await waitFor(() => expect(screen.getByText('Sugar', { selector: 'span' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/product/i), 'p1');
    await userEvent.clear(screen.getByLabelText(/quantity/i));
    await userEvent.type(screen.getByLabelText(/quantity/i), '-2');
    await userEvent.type(screen.getByLabelText(/reason/i), 'breakage');
    await userEvent.click(screen.getByRole('button', { name: /save adjustment/i }));

    await waitFor(() =>
      expect(screen.getByText(/-2/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/breakage/)).toBeInTheDocument();
  });

  it('requires a positive quantity for RECEIVE', async () => {
    mockSession(['catalog:read', 'inventory:read', 'inventory:write']);
    vi.spyOn(authMod, 'authFetch').mockResolvedValue({ stockLevel: 0 });
    await seedProduct({ clientId: 'p1', name: 'Flour', serverId: 'srv2' });
    render(<InventoryPage />);

    await waitFor(() => expect(screen.getByText('Flour', { selector: 'span' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/product/i), 'p1');
    await userEvent.click(screen.getByLabelText(/receive/i));
    await userEvent.clear(screen.getByLabelText(/quantity/i));
    await userEvent.type(screen.getByLabelText(/quantity/i), '-5');
    await userEvent.click(screen.getByRole('button', { name: /save adjustment/i }));

    expect(await screen.findByText(/receive quantity must be positive/i)).toBeInTheDocument();
  });

  it('flags negative stock fetched from the server', async () => {
    mockSession(['catalog:read', 'inventory:read', 'inventory:write']);
    vi.spyOn(authMod, 'authFetch').mockResolvedValue({ stockLevel: -3 });
    await seedProduct({ clientId: 'p1', name: 'Oil', serverId: 'srv3' });
    render(<InventoryPage />);

    await waitFor(() =>
      expect(screen.getByText(/negative stock/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/-3 in stock/i)).toBeInTheDocument();
  });

  it('shows a stale hint when stock data was fetched before going offline', async () => {
    mockSession(['catalog:read', 'inventory:read', 'inventory:write']);
    vi.spyOn(authMod, 'authFetch').mockResolvedValue({ stockLevel: 4 });
    await seedProduct({ clientId: 'p1', name: 'Rice', serverId: 'srv4' });
    render(<InventoryPage />);

    await waitFor(() => expect(screen.getByText(/4 in stock/i)).toBeInTheDocument());
    setOnline(false);
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() =>
      expect(screen.getByText(/last known, offline/i)).toBeInTheDocument(),
    );
  });
});
