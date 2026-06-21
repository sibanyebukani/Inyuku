// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrderDetailPage from './page';
import * as sessionMod from '@/lib/session/SessionProvider';
import * as authMod from '@/lib/session/authFetch';
import { useOrderStore } from '@/lib/orders/store';
import { openDb } from '@/lib/offline/db';
import { makeRepo } from '@/lib/offline/repo';
import type { OrderRow } from '@/lib/offline/types';

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

async function seedOrder(row: Partial<OrderRow> & { clientId: string }) {
  const full: OrderRow = {
    status: 'COMPLETED',
    channel: 'IN_PERSON',
    paymentState: 'PAID',
    subtotalCents: 0,
    totalCents: 0,
    occurredAt: '2026-06-21T10:00:00.000Z',
    lines: [],
    _syncState: 'synced',
    updatedAtLocal: '2026-06-21T10:00:00.000Z',
    ...row,
  } as OrderRow;
  await makeRepo<OrderRow>('orders').put(full);
}

vi.mock('next/navigation', () => ({
  useParams: () => ({ clientId: 'o1' }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

describe('OrderDetailPage', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    setOnline(true);
    mockSession(['order:read', 'order:write']);
    const db = await openDb();
    await db.clear('orders');
    await db.clear('outbox');
    db.close();
    useOrderStore.setState({ items: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders order lines and totals', async () => {
    await seedOrder({
      clientId: 'o1',
      serverId: 'srv-o1',
      orderNumber: '0001',
      totalCents: 3000,
      paymentState: 'PAID',
      status: 'COMPLETED',
      occurredAt: '2026-06-21T10:00:00.000Z',
      lines: [{ productId: 'srv1', nameSnapshot: 'Milk', unitPriceCents: 1500, qty: 2, lineTotalCents: 3000 }],
    });
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText(/Order #0001/i)).toBeInTheDocument());
    expect(screen.getByText(/Milk/i)).toBeInTheDocument();
    expect(screen.getByText(/2 × R 15.00 = R 30.00/i)).toBeInTheDocument();
    expect(screen.getByText(/Total: R 30.00/i)).toBeInTheDocument();
  });

  it('voids an order online', async () => {
    await seedOrder({
      clientId: 'o1',
      serverId: 'srv-o1',
      orderNumber: '0001',
      totalCents: 1000,
      paymentState: 'PAID',
      status: 'COMPLETED',
      occurredAt: '2026-06-21T10:00:00.000Z',
      lines: [],
    });
    vi.spyOn(authMod, 'authFetch').mockResolvedValue({
      order: { id: 'srv-o1', status: 'VOID', paymentState: 'PAID', subtotalCents: 1000, totalCents: 1000, occurredAt: '2026-06-21T10:00:00.000Z', lines: [] },
    });
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /void/i })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /void/i }));
    await waitFor(() => expect(screen.getByText(/VOID/i)).toBeInTheDocument());
    expect(authMod.authFetch).toHaveBeenCalledWith(
      '/v1/businesses/biz1/orders/srv-o1/void',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('disables online-only actions when offline and shows a tooltip', async () => {
    await seedOrder({
      clientId: 'o1',
      serverId: 'srv-o1',
      orderNumber: '0001',
      totalCents: 1000,
      paymentState: 'PAID',
      status: 'COMPLETED',
      occurredAt: '2026-06-21T10:00:00.000Z',
      lines: [],
    });
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /void/i })).toBeEnabled());
    setOnline(false);
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /void/i })).toBeDisabled());
    expect(screen.getByRole('button', { name: /void/i })).toHaveAttribute('title', expect.stringContaining('online only'));
  });

  it('hides action buttons for users without order:write', async () => {
    mockSession(['order:read']);
    await seedOrder({
      clientId: 'o1',
      serverId: 'srv-o1',
      orderNumber: '0001',
      totalCents: 1000,
      paymentState: 'PAID',
      status: 'COMPLETED',
      occurredAt: '2026-06-21T10:00:00.000Z',
      lines: [],
    });
    render(<OrderDetailPage />);
    await waitFor(() => expect(screen.getByText(/Order #0001/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /void/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /complete/i })).not.toBeInTheDocument();
  });
});
