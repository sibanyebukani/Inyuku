// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import CustomerDetailPage from './page';
import * as sessionMod from '@/lib/session/SessionProvider';
import * as authMod from '@/lib/session/authFetch';
import * as onlineMod from '@/lib/offline/useOnline';
import { makeRepo } from '@/lib/offline/repo';
import { openDb } from '@/lib/offline/db';
import type { CustomerRow, OrderRow } from '@/lib/offline/types';

function mockSession() {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [],
    activeBusinessId: 'biz1',
    hasPerm: () => true,
  });
}

function setOnline(value: boolean) {
  vi.spyOn(onlineMod, 'useOnline').mockReturnValue(value);
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

async function seedCustomer(row: Partial<CustomerRow> & { clientId: string }) {
  const full: CustomerRow = {
    name: 'C',
    _syncState: 'synced',
    updatedAtLocal: '2026-06-21T10:00:00.000Z',
    ...row,
  } as CustomerRow;
  await makeRepo<CustomerRow>('customers').put(full);
  return full;
}

async function seedOrder(row: Partial<OrderRow> & { clientId: string }) {
  const full: OrderRow = {
    orderNumber: '0001',
    status: 'COMPLETED',
    channel: 'IN_PERSON',
    paymentState: 'PAID',
    subtotalCents: 1000,
    totalCents: 1000,
    occurredAt: '2026-06-21T10:00:00.000Z',
    lines: [],
    _syncState: 'synced',
    updatedAtLocal: '2026-06-21T10:00:00.000Z',
    ...row,
  } as OrderRow;
  await makeRepo<OrderRow>('orders').put(full);
  return full;
}

vi.mock('next/navigation', () => ({
  useParams: () => ({ clientId: 'c1' }),
}));

describe('CustomerDetailPage', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    setOnline(true);
    const db = await openDb();
    await db.clear('customers');
    await db.clear('orders');
    db.close();
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders customer details and recent orders from the server', async () => {
    mockSession();
    await seedCustomer({ clientId: 'c1', name: 'Nomsa', serverId: 'srv_c1' });
    vi.spyOn(authMod, 'authFetch').mockResolvedValue({
      customer: {
        id: 'srv_c1',
        name: 'Nomsa Server',
        phone: '+27821234567',
        orders: [
          { id: 'o1', orderNumber: '0001', status: 'COMPLETED', totalCents: 1500, occurredAt: '2026-06-21T10:00:00.000Z' },
        ],
      },
    });
    render(<CustomerDetailPage />);
    await waitFor(() => expect(screen.getByText('Nomsa Server')).toBeInTheDocument());
    expect(screen.getByText('+27821234567')).toBeInTheDocument();
    expect(screen.getByText(/order 0001/i)).toBeInTheDocument();
    expect(screen.getByText(/r 15\.00/i)).toBeInTheDocument();
    expect(authMod.authFetch).toHaveBeenCalledWith('/v1/businesses/biz1/customers/srv_c1');
  });

  it('shows locally-known orders when offline', async () => {
    mockSession();
    setOnline(false);
    await seedCustomer({ clientId: 'c1', name: 'Nomsa' });
    await seedOrder({ clientId: 'o1', customerId: 'c1', totalCents: 2000, orderNumber: '0002' });
    render(<CustomerDetailPage />);
    await waitFor(() => expect(screen.getByText('Nomsa')).toBeInTheDocument());
    expect(screen.getByText(/offline — showing locally-known orders/i)).toBeInTheDocument();
    expect(screen.getByText(/order 0002/i)).toBeInTheDocument();
    expect(screen.getByText(/r 20\.00/i)).toBeInTheDocument();
  });

  it('matches local orders by serverId when customer has synced', async () => {
    mockSession();
    setOnline(false);
    await seedCustomer({ clientId: 'c1', name: 'Nomsa', serverId: 'srv_c1' });
    await seedOrder({ clientId: 'o1', customerId: 'srv_c1', totalCents: 3000, orderNumber: '0003' });
    render(<CustomerDetailPage />);
    await waitFor(() => expect(screen.getByText(/order 0003/i)).toBeInTheDocument());
  });

  it('shows not found when customer is absent locally', async () => {
    mockSession();
    setOnline(false);
    render(<CustomerDetailPage />);
    await waitFor(() => expect(screen.getByText(/customer not found/i)).toBeInTheDocument());
  });
});
