// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import OrdersPage from './page';
import * as sessionMod from '@/lib/session/SessionProvider';
import { useOrderStore } from '@/lib/orders/store';
import { openDb } from '@/lib/offline/db';
import { makeRepo } from '@/lib/offline/repo';
import type { OrderRow } from '@/lib/offline/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
}));

function mockSession(perms: string[]) {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [],
    activeBusinessId: 'biz1',
    hasPerm: (p: string) => perms.includes(p),
  });
}

async function seedOrder(row: Partial<OrderRow> & { clientId: string }) {
  const full: OrderRow = {
    status: 'COMPLETED',
    channel: 'IN_PERSON',
    paymentState: 'PAID',
    subtotalCents: 0,
    totalCents: 0,
    occurredAt: '2026-06-21T10:00:00.000Z',
    lines: [],
    _syncState: 'pending',
    updatedAtLocal: '2026-06-21T10:00:00.000Z',
    ...row,
  } as OrderRow;
  await makeRepo<OrderRow>('orders').put(full);
}

describe('OrdersPage', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    mockSession(['order:read', 'order:write']);
    const db = await openDb();
    await db.clear('orders');
    await db.clear('outbox');
    db.close();
    useOrderStore.setState({ items: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('lists orders with totals, status, payment state and sync badge', async () => {
    await seedOrder({
      clientId: 'o1',
      orderNumber: '0001',
      totalCents: 4500,
      paymentState: 'UNPAID',
      status: 'COMPLETED',
      occurredAt: '2026-06-21T10:00:00.000Z',
      lines: [{ productId: 'srv1', nameSnapshot: 'Bread', unitPriceCents: 1500, qty: 3, lineTotalCents: 4500 }],
    });
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText(/#0001/i)).toBeInTheDocument());
    const row = screen.getByText(/#0001/i).closest('li')!;
    expect(row).toHaveTextContent('R 45.00');
    expect(row).toHaveTextContent('COMPLETED');
    expect(row).toHaveTextContent('UNPAID');
    expect(row).toHaveTextContent('Pending');
  });

  it('shows an empty state when there are no orders', async () => {
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText(/no orders yet/i)).toBeInTheDocument());
  });
});
