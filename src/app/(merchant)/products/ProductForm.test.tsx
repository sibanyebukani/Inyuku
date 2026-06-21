// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductForm } from './ProductForm';
import * as sessionMod from '@/lib/session/SessionProvider';
import { useProductStore } from '@/lib/products/store';

function mockSession(perms: string[]) {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [],
    activeBusinessId: 'biz1',
    hasPerm: (p: string) => perms.includes(p),
  });
}

describe('ProductForm', () => {
  beforeEach(() => vi.restoreAllMocks());
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
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Bread', sellPriceCents: 1500, costPriceCents: 950 }),
    );
  });
});
