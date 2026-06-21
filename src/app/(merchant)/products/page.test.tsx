// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProductsPage from './page';
import * as sessionMod from '@/lib/session/SessionProvider';
import { useProductStore } from '@/lib/products/store';
import { openDb } from '@/lib/offline/db';

function mockSession(perms: string[]) {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [], activeBusinessId: 'biz1', hasPerm: (p: string) => perms.includes(p),
  });
}

describe('ProductsPage', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('products');
    await db.clear('outbox');
    db.close();
    useProductStore.setState({ items: [] });
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
});
