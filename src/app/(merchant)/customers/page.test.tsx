// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomersPage from './page';
import * as sessionMod from '@/lib/session/SessionProvider';
import { useCustomerStore } from '@/lib/customers/store';
import { openDb } from '@/lib/offline/db';
import { makeRepo } from '@/lib/offline/repo';
import type { CustomerRow } from '@/lib/offline/types';

function mockSession(perms: string[]) {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [],
    activeBusinessId: 'biz1',
    hasPerm: (p: string) => perms.includes(p),
  });
}

async function seedCustomer(row: Partial<CustomerRow> & { clientId: string }) {
  const full: CustomerRow = {
    name: 'C',
    _syncState: 'synced',
    updatedAtLocal: '2026-06-21T10:00:00.000Z',
    ...row,
  } as CustomerRow;
  const repo = makeRepo<CustomerRow>('customers');
  await repo.put(full);
  return full;
}

describe('CustomersPage', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    const db = await openDb();
    await db.clear('customers');
    await db.clear('outbox');
    db.close();
    useCustomerStore.setState({ items: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders customers with contact details and sync badges', async () => {
    mockSession(['customer:read', 'customer:write']);
    await seedCustomer({ clientId: 'c1', name: 'Nomsa', phone: '+27821234567' });
    render(<CustomersPage />);
    await waitFor(() => expect(screen.getByText('Nomsa')).toBeInTheDocument());
    expect(screen.getByText('+27821234567')).toBeInTheDocument();
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });

  it('hides the add/edit UI for read-only users', async () => {
    mockSession(['customer:read']);
    await seedCustomer({ clientId: 'c1', name: 'Nomsa' });
    render(<CustomersPage />);
    await waitFor(() => expect(screen.getByText('Nomsa')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /save customer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('opens the edit form pre-filled when Edit is clicked', async () => {
    mockSession(['customer:read', 'customer:write']);
    await seedCustomer({ clientId: 'c1', name: 'Nomsa', phone: '+27821234567' });
    render(<CustomersPage />);
    await waitFor(() => expect(screen.getByText('Nomsa')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    await waitFor(() => expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('Nomsa'));
    expect((screen.getByLabelText(/phone/i) as HTMLInputElement).value).toBe('+27821234567');
  });

  it('links each customer to their detail page', async () => {
    mockSession(['customer:read']);
    await seedCustomer({ clientId: 'c1', name: 'Nomsa' });
    render(<CustomersPage />);
    await waitFor(() => expect(screen.getByRole('link', { name: /nomsa/i })).toHaveAttribute('href', '/customers/c1'));
  });
});
