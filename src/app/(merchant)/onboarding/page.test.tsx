// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingPage from './page';
import { clearOnboardingSkip } from '@/lib/onboarding/store';
import * as sessionMod from '@/lib/session/SessionProvider';
import * as authMod from '@/lib/session/authFetch';
import * as productMod from '@/lib/products/store';
import { useOnboardingStore } from '@/lib/onboarding/store';
import { useProductStore } from '@/lib/products/store';
import { openDb } from '@/lib/offline/db';
import { makeRepo } from '@/lib/offline/repo';
import type { ProductRow } from '@/lib/offline/types';

const replaceSpy = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceSpy }),
}));

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
  const repo = makeRepo<ProductRow>('products');
  await repo.put(full);
  return full;
}

describe('OnboardingPage', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    replaceSpy.mockClear();
    clearOnboardingSkip();
    useProductStore.setState({ items: [] });
    useOnboardingStore.setState({
      step: 'profile',
      businessName: '',
      productClientId: null,
      error: null,
    });
    const db = await openDb();
    await db.clear('products');
    await db.clear('outbox');
    db.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearOnboardingSkip();
  });

  it('redirects to products when the merchant already has products', async () => {
    mockSession(['business:update', 'catalog:write']);
    await seedProduct({ clientId: 'p1', name: 'Existing' });
    render(<OnboardingPage />);
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/products'));
  });

  it('redirects to products when onboarding has been skipped', async () => {
    mockSession(['business:update', 'catalog:write']);
    localStorage.setItem('inyuku_onboarding_skipped', '1');
    render(<OnboardingPage />);
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/products'));
  });

  it('shows the profile step first and advances after a successful update', async () => {
    mockSession(['business:update', 'catalog:write']);
    const authSpy = vi.spyOn(authMod, 'authFetch').mockResolvedValue({ business: { name: 'Nomsa Store' } });
    render(<OnboardingPage />);

    await waitFor(() => expect(screen.getByLabelText(/business name/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/business name/i), 'Nomsa Store');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(authSpy).toHaveBeenCalledWith('/v1/businesses/biz1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Nomsa Store' }),
    }));
    expect(screen.getByLabelText(/product name/i)).toBeInTheDocument();
  });

  it('completes the full wizard and creates a product with opening stock', async () => {
    mockSession(['business:update', 'catalog:write', 'catalog:read_cost']);
    vi.spyOn(authMod, 'authFetch').mockResolvedValue({ business: { name: 'Nomsa Store' } });
    const createSpy = vi
      .spyOn(productMod.useProductStore.getState(), 'create')
      .mockResolvedValue('prod-cid');

    render(<OnboardingPage />);

    // Profile
    await waitFor(() => expect(screen.getByLabelText(/business name/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/business name/i), 'Nomsa Store');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Product
    await waitFor(() => expect(screen.getByLabelText(/product name/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/product name/i), 'Bread');
    await userEvent.type(screen.getByLabelText(/sell price/i), '15.00');
    await userEvent.type(screen.getByLabelText(/cost price/i), '9.00');
    await userEvent.type(screen.getByLabelText(/low-stock threshold/i), '5');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Stock
    await waitFor(() => expect(screen.getByLabelText(/opening stock/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/opening stock/i), '20');
    await userEvent.click(screen.getByRole('button', { name: /finish/i }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Bread',
          sellPriceCents: 1500,
          costPriceCents: 900,
          lowStockThreshold: 5,
          openingStock: 20,
        }),
      ),
    );
    expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
  });

  it('hides the cost field for staff without catalog:read_cost', async () => {
    mockSession(['business:update', 'catalog:write']);
    vi.spyOn(authMod, 'authFetch').mockResolvedValue({ business: { name: 'Nomsa Store' } });
    render(<OnboardingPage />);

    await waitFor(() => expect(screen.getByLabelText(/business name/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/business name/i), 'Nomsa Store');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(screen.getByLabelText(/product name/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/cost price/i)).not.toBeInTheDocument();
  });

  it('lets the user skip the wizard', async () => {
    mockSession(['business:update', 'catalog:write']);
    render(<OnboardingPage />);
    await waitFor(() => expect(screen.getByText(/skip setup for now/i)).toBeInTheDocument());
    await userEvent.click(screen.getByText(/skip setup for now/i));
    expect(localStorage.getItem('inyuku_onboarding_skipped')).toBe('1');
    expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
  });
});
