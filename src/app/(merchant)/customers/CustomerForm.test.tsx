// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerForm } from './CustomerForm';
import * as sessionMod from '@/lib/session/SessionProvider';
import { useCustomerStore } from '@/lib/customers/store';
import { openDb } from '@/lib/offline/db';
import type { CustomerRow } from '@/lib/offline/types';

function mockSession(perms: string[]) {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [],
    activeBusinessId: 'biz1',
    hasPerm: (p: string) => perms.includes(p),
  });
}

describe('CustomerForm', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    const db = await openDb();
    await db.clear('customers');
    await db.clear('outbox');
    db.close();
    useCustomerStore.setState({ items: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('disables inputs and submit for read-only users', () => {
    mockSession(['customer:read']);
    render(<CustomerForm />);
    expect(screen.getByLabelText(/name/i)).toBeDisabled();
    expect(screen.getByLabelText(/phone/i)).toBeDisabled();
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByLabelText(/notes/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /save customer/i })).toBeDisabled();
  });

  it('shows validation errors and does NOT call create when phone is invalid', async () => {
    mockSession(['customer:write']);
    const createSpy = vi.spyOn(useCustomerStore.getState(), 'create').mockResolvedValue('cid');
    render(<CustomerForm />);
    await userEvent.type(screen.getByLabelText(/name/i), 'Nomsa');
    await userEvent.type(screen.getByLabelText(/phone/i), 'abc');
    await userEvent.click(screen.getByRole('button', { name: /save customer/i }));
    expect(await screen.findByText(/enter a valid phone number/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('creates a customer with trimmed optional fields', async () => {
    mockSession(['customer:write']);
    const createSpy = vi.spyOn(useCustomerStore.getState(), 'create').mockResolvedValue('cid');
    render(<CustomerForm />);
    await userEvent.type(screen.getByLabelText(/name/i), 'Nomsa');
    await userEvent.type(screen.getByLabelText(/phone/i), '+27821234567');
    await userEvent.type(screen.getByLabelText(/email/i), 'nomsa@example.com');
    await userEvent.type(screen.getByLabelText(/notes/i), 'Regular');
    await userEvent.click(screen.getByRole('button', { name: /save customer/i }));
    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith({
        name: 'Nomsa',
        phone: '+27821234567',
        email: 'nomsa@example.com',
        notes: 'Regular',
      }),
    );
  });

  it('prefills edit mode and calls update', async () => {
    mockSession(['customer:write']);
    const updateSpy = vi.spyOn(useCustomerStore.getState(), 'update').mockResolvedValue(undefined);
    const row: CustomerRow = {
      clientId: 'c1',
      name: 'Sipho',
      phone: '+27830000000',
      email: 'sipho@example.com',
      notes: 'VIP',
      _syncState: 'synced',
      updatedAtLocal: '2026-06-21T10:00:00.000Z',
    };
    render(<CustomerForm row={row} />);
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('Sipho');
    expect((screen.getByLabelText(/phone/i) as HTMLInputElement).value).toBe('+27830000000');

    await userEvent.clear(screen.getByLabelText(/name/i));
    await userEvent.type(screen.getByLabelText(/name/i), 'Sipho Updated');
    await userEvent.click(screen.getByRole('button', { name: /update customer/i }));
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ name: 'Sipho Updated', phone: '+27830000000' }),
      ),
    );
  });

  it('does NOT render any consent-capture UI', () => {
    mockSession(['customer:write']);
    render(<CustomerForm />);
    expect(screen.queryByLabelText(/consent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/consent/i)).not.toBeInTheDocument();
  });
});
