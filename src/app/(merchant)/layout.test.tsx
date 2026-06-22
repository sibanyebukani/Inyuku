// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MerchantLayout from './layout';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/orders',
}));

vi.mock('@/lib/offline/useOnline', () => ({ useOnline: () => true }));

vi.mock('@/lib/session/SessionProvider', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSession: () => ({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [],
    activeBusinessId: 'biz1',
    hasPerm: () => true,
  }),
}));

vi.mock('@/lib/offline/triggers', () => ({
  registerSyncTriggers: () => () => {},
}));

describe('MerchantLayout', () => {
  it('renders nav links and highlights the active route', () => {
    render(
      <MerchantLayout>
        <div data-testid="page">Page</div>
      </MerchantLayout>,
    );

    for (const label of ['Dashboard', 'Products', 'Orders', 'Customers', 'Inventory', 'Onboarding']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }

    const ordersLink = screen.getByRole('link', { name: 'Orders' });
    expect(ordersLink).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Products' })).not.toHaveAttribute('aria-current');
  });
});
