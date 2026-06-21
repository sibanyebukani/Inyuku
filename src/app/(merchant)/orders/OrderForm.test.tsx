// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderForm } from './OrderForm';
import * as sessionMod from '@/lib/session/SessionProvider';
import { useProductStore } from '@/lib/products/store';
import { useCustomerStore } from '@/lib/customers/store';
import { useOrderStore } from '@/lib/orders/store';
import { openDb } from '@/lib/offline/db';
import { makeRepo } from '@/lib/offline/repo';
import type { ProductRow, CustomerRow } from '@/lib/offline/types';

function mockSession(perms: string[]) {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [],
    activeBusinessId: 'biz1',
    hasPerm: (p: string) => perms.includes(p),
  });
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
  await makeRepo<ProductRow>('products').put(full);
}

async function seedCustomer(row: Partial<CustomerRow> & { clientId: string }) {
  const full: CustomerRow = {
    name: 'C',
    _syncState: 'synced',
    updatedAtLocal: '2026-06-21T10:00:00.000Z',
    ...row,
  } as CustomerRow;
  await makeRepo<CustomerRow>('customers').put(full);
}

describe('OrderForm', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    mockSession(['order:write', 'catalog:read']);
    const db = await openDb();
    await db.clear('orders');
    await db.clear('outbox');
    await db.clear('products');
    await db.clear('customers');
    db.close();
    useProductStore.setState({ items: [] });
    useCustomerStore.setState({ items: [] });
    useOrderStore.setState({ items: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('records a completed sale with integer-cent totals', async () => {
    await seedProduct({ clientId: 'p1', serverId: 'srv1', name: 'Bread', sellPriceCents: 1500 });
    await seedCustomer({ clientId: 'c1', serverId: 'cust1', name: 'Nomsa' });
    await useProductStore.getState().load();
    await useCustomerStore.getState().load();

    const createSpy = vi.spyOn(useOrderStore.getState(), 'create').mockResolvedValue('o1');
    render(<OrderForm />);

    await waitFor(() => expect(screen.getByRole('option', { name: /bread/i })).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/product/i), 'srv1');
    await userEvent.clear(screen.getByLabelText(/quantity/i));
    await userEvent.type(screen.getByLabelText(/quantity/i), '3');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() => expect(screen.getByText(/3 × R 15.00 = R 45.00/i)).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/customer/i), 'cust1');
    await userEvent.selectOptions(screen.getByLabelText(/payment/i), 'UNPAID');
    await userEvent.click(screen.getByRole('button', { name: /record sale/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust1',
        paymentState: 'UNPAID',
        status: 'COMPLETED',
        channel: 'IN_PERSON',
        subtotalCents: 4500,
        totalCents: 4500,
        lines: [expect.objectContaining({ productId: 'srv1', nameSnapshot: 'Bread', unitPriceCents: 1500, qty: 3, lineTotalCents: 4500 })],
      }),
    );
  });

  it('does not submit without any lines', async () => {
    await seedProduct({ clientId: 'p1', serverId: 'srv1', name: 'Bread', sellPriceCents: 1500 });
    const createSpy = vi.spyOn(useOrderStore.getState(), 'create').mockResolvedValue('o1');
    render(<OrderForm />);
    await waitFor(() => expect(screen.getByRole('button', { name: /record sale/i })).toBeDisabled());
    await userEvent.click(screen.getByRole('button', { name: /record sale/i }));
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('disables the form for users without order:write', async () => {
    mockSession(['order:read']);
    render(<OrderForm />);
    expect(screen.getByRole('button', { name: /record sale/i })).toBeDisabled();
    expect(screen.getByText(/you do not have permission/i)).toBeInTheDocument();
  });
});
